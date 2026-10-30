#include "mainwindow.h"
#include "ui_mainwindow.h"
#include "business/animeanbusiness.h"
#include "childrenpanel/assetpanel.h"
#include "childrenpanel/forcepad.h"
#include "childrenpanel/historypanel.h"
#include "childrenpanel/layerpanel.h"
#include "childrenpanel/newprojectdialog.h"
#include "childrenpanel/texturepanel.h"
#include "childrenpanel/timelinewindow.h"

#include <QComboBox>
#include "centralpaintarea.h"
#include "clipreader.h"
#include "openglwidget.h"
#include "algorithm/beziersplit.h"
#include "paintviewcontainer.h"
#include "parentwindow.h"
#include "projectio.h"
#include "selectionattention.h"
#include "subcontrolframe.h"
#include "theme.h"
#include "childrenpanel/tooloptpanel.h"
#include "childrenpanel/toolcontrolconfig.h"
#include "childrenpanel/toolspanel.h"
#include "pythonbind/python_bindings.h"

#include <QAbstractItemModel>
#include <QAbstractItemView>
#include <QAction>
#include <QActionGroup>
#include <QApplication>
#include <QBrush>
#include <QCoreApplication>
#include <QHash>
#include <QDockWidget>
#include <QDropEvent>
#include <QDir>
#include <QEvent>
#include <QEventLoop>
#include <QFile>
#include <QDialog>
#include <QDialogButtonBox>
#include <QFileInfo>
#include <QFileDialog>
#include <QHBoxLayout>
#include <QImageReader>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QMenu>
#include <QMenuBar>
#include <QMessageBox>
#include <QMouseEvent>
#include <QPalette>
#include <QSizeF>
#include <QRectF>
#include <QTransform>
#include <QPlainTextEdit>
#include <QPushButton>
#include <QSaveFile>
#include <QScrollBar>
#include <QSignalBlocker>
#include <QStatusBar>
#include <QTimer>
#include <QTreeWidget>
#include <QVBoxLayout>
#include <QWidget>

#include <algorithm>
#include <cmath>
#include <functional>
#include <string>

#ifdef ANIMEAN_WITH_PYTHON
#ifdef slots
#undef slots
#define ANIMEAN_RESTORE_QT_SLOTS
#endif
#include <pybind11/embed.h>
#include <pybind11/eval.h>
#ifdef ANIMEAN_RESTORE_QT_SLOTS
#define slots Q_SLOTS
#undef ANIMEAN_RESTORE_QT_SLOTS
#endif
namespace py = pybind11;
#endif

namespace {
// Timeline playback rate; the prerendered frames are blitted at this cadence.
constexpr int kPlaybackFps = 12;

// Layer panel item roles. Qt::UserRole stays the layer index (it is what the
// rest of this file already reads); groups carry -1 there and their group id
// here, so "is this row a group" is one lookup.
constexpr int kGroupIdRole = Qt::UserRole + 1;

QString toolControlName(PaintOpenGLWidget::Tool tool)
{
    switch (tool) {
    case PaintOpenGLWidget::Tool::Pen:
        return QStringLiteral("pen");
    case PaintOpenGLWidget::Tool::Eraser:
        return QStringLiteral("eraser");
    case PaintOpenGLWidget::Tool::DeleteLine:
        return QStringLiteral("delete_line");
    case PaintOpenGLWidget::Tool::CutLine:
        return QStringLiteral("cut_line");
    case PaintOpenGLWidget::Tool::Fill:
        return QStringLiteral("fill");
    case PaintOpenGLWidget::Tool::Arrow:
        return QStringLiteral("arrow");
    case PaintOpenGLWidget::Tool::Connect:
        return QStringLiteral("connect");
    case PaintOpenGLWidget::Tool::Transfer:
        return QStringLiteral("transfer");
    }
    return QStringLiteral("pen");
}

// The lock NAME a tool answers to. Delete Line and Cut Line are eraser
// sub-modes chosen in the tool options, not tools of their own (the rail draws
// ONE eraser chip for all three), so one lock covers the family - locking
// "eraser" and leaving its two sub-modes armable would be no lock at all.
QString toolLockName(PaintOpenGLWidget::Tool tool)
{
    switch (tool) {
    case PaintOpenGLWidget::Tool::DeleteLine:
    case PaintOpenGLWidget::Tool::CutLine:
        return QStringLiteral("eraser");
    default:
        return toolControlName(tool);
    }
}

// The tools that have a chip on the painting rail, in rail order.
const PaintOpenGLWidget::Tool kLockableTools[] = {
    PaintOpenGLWidget::Tool::Arrow,
    PaintOpenGLWidget::Tool::Pen,
    PaintOpenGLWidget::Tool::Eraser,
    PaintOpenGLWidget::Tool::Fill,
    PaintOpenGLWidget::Tool::Transfer,
    PaintOpenGLWidget::Tool::Connect,
};

int frameNameToRow(const QString &frameName)
{
    QString digits;
    for (const QChar ch : frameName) {
        if (!ch.isDigit()) {
            break;
        }
        digits.append(ch);
    }

    bool ok = false;
    const int frameNumber = digits.toInt(&ok);
    return ok && frameNumber > 0 ? frameNumber - 1 : 0;
}

QVector<ToolsPanel::ExtraToolDefinition> parseExtraTools(const QJsonArray &array)
{
    QVector<ToolsPanel::ExtraToolDefinition> tools;
    for (const QJsonValue &value : array) {
        if (!value.isObject()) {
            continue;
        }

        const QJsonObject object = value.toObject();
        ToolsPanel::ExtraToolDefinition tool;
        tool.name = object.value(QStringLiteral("name")).toString();
        tool.title = object.value(QStringLiteral("title")).toString(tool.name);
        tool.property = object.value(QStringLiteral("property")).toString(tool.name);
        tool.handler = object.value(QStringLiteral("handler")).toString();
        tool.baseTool = object.value(QStringLiteral("base_tool")).toString();
        // Mapping is the default page: every extra tool that existed before
        // the Tools window gained pages was a mapping tool, so an undeclared
        // page means the one they all came from.
        tool.page = object.value(QStringLiteral("page")).toString(QStringLiteral("mapping"));
        if (!tool.name.isEmpty()) {
            tools.append(tool);
        }
    }
    return tools;
}

#ifdef ANIMEAN_WITH_PYTHON
qreal dictNumber(const py::dict &data, const char *key, qreal fallback = 0.0)
{
    if (!data.contains(py::str(key))) {
        return fallback;
    }
    try {
        return data[py::str(key)].cast<qreal>();
    } catch (const py::cast_error &) {
        return fallback;
    }
}

QPointF pointFromDict(const py::dict &data)
{
    return QPointF(dictNumber(data, "x"), dictNumber(data, "y"));
}

qreal thicknessFromDict(const py::dict &data)
{
    return dictNumber(data, "thick", 3.0);
}

void appendQuadraticMetricPoints(QVector<QPointF> *points,
                                 const QPointF &p0,
                                 const QPointF &p1,
                                 const QPointF &p2,
                                 int sampleCount)
{
    if (points->isEmpty()) {
        points->append(p0);
    }

    // Elevated and evaluated by the shared exact-bezier home
    // (algorithm/beziersplit.h). The path stores this quad as an elevated
    // cubic (quadTo), so the metric polyline now samples exactly the
    // geometry the stored path renders.
    QPointF cubic[4];
    AnimeBezierSplit::quadToCubic(p0, p1, p2, cubic);
    sampleCount = std::max(2, sampleCount);
    for (int i = 1; i <= sampleCount; ++i) {
        points->append(AnimeBezierSplit::evaluateCubic(cubic, static_cast<qreal>(i) / sampleCount));
    }
}

QVector<PaintOpenGLWidget::ImportedVectorFrame> importedFramesFromOpenToonzLevel(const py::dict &levelData)
{
    QVector<PaintOpenGLWidget::ImportedVectorFrame> importedFrames;
    if (!levelData.contains(py::str("frames"))) {
        return importedFrames;
    }

    py::iterable frames = levelData[py::str("frames")];
    for (py::handle frameHandle : frames) {
        if (!py::isinstance<py::dict>(frameHandle)) {
            continue;
        }
        py::dict frameDict = py::reinterpret_borrow<py::dict>(frameHandle);
        PaintOpenGLWidget::ImportedVectorFrame importedFrame;
        QString frameName = QStringLiteral("1");
        if (frameDict.contains(py::str("frame"))) {
            const std::string frameNameText = frameDict[py::str("frame")].cast<std::string>();
            frameName = QString::fromUtf8(frameNameText.c_str());
        }
        importedFrame.row = frameNameToRow(frameName);

        if (!frameDict.contains(py::str("strokes"))) {
            continue;
        }
        py::iterable strokes = frameDict[py::str("strokes")];
        for (py::handle strokeHandle : strokes) {
            if (!py::isinstance<py::dict>(strokeHandle)) {
                continue;
            }
            py::dict strokeDict = py::reinterpret_borrow<py::dict>(strokeHandle);
            if (!strokeDict.contains(py::str("quadratics"))) {
                continue;
            }

            PaintOpenGLWidget::ImportedVectorStroke importedStroke;
            bool hasPathStart = false;
            qreal thicknessTotal = 0.0;
            int thicknessCount = 0;
            py::iterable quadratics = strokeDict[py::str("quadratics")];
            for (py::handle quadraticHandle : quadratics) {
                if (!py::isinstance<py::dict>(quadraticHandle)) {
                    continue;
                }
                py::dict quadratic = py::reinterpret_borrow<py::dict>(quadraticHandle);
                if (!quadratic.contains(py::str("p0")) ||
                    !quadratic.contains(py::str("p1")) ||
                    !quadratic.contains(py::str("p2"))) {
                    continue;
                }

                py::dict p0Dict = py::reinterpret_borrow<py::dict>(quadratic[py::str("p0")]);
                py::dict p1Dict = py::reinterpret_borrow<py::dict>(quadratic[py::str("p1")]);
                py::dict p2Dict = py::reinterpret_borrow<py::dict>(quadratic[py::str("p2")]);
                const QPointF p0 = pointFromDict(p0Dict);
                const QPointF p1 = pointFromDict(p1Dict);
                const QPointF p2 = pointFromDict(p2Dict);
                if (!hasPathStart) {
                    importedStroke.path.moveTo(p0);
                    hasPathStart = true;
                } else if (!qFuzzyCompare(importedStroke.path.currentPosition().x(), p0.x()) ||
                           !qFuzzyCompare(importedStroke.path.currentPosition().y(), p0.y())) {
                    importedStroke.path.lineTo(p0);
                }
                importedStroke.path.quadTo(p1, p2);
                const qreal approxLength = QLineF(p0, p1).length() + QLineF(p1, p2).length();
                appendQuadraticMetricPoints(&importedStroke.points,
                                            p0,
                                            p1,
                                            p2,
                                            std::max(4, static_cast<int>(std::ceil(approxLength / 6.0))));
                thicknessTotal += thicknessFromDict(p0Dict) + thicknessFromDict(p1Dict) + thicknessFromDict(p2Dict);
                thicknessCount += 3;
            }

            if (importedStroke.points.size() >= 2) {
                importedStroke.width = thicknessCount > 0
                                           ? std::max(qreal(1.0), thicknessTotal / thicknessCount)
                                           : std::max(qreal(1.0), dictNumber(strokeDict, "max_thickness", 3.0) * 0.2);
                importedFrame.strokes.append(importedStroke);
            }
        }

        if (!importedFrame.strokes.isEmpty()) {
            importedFrames.append(importedFrame);
        }
    }
    return importedFrames;
}
#endif

QRectF importedVectorFramesBounds(const QVector<PaintOpenGLWidget::ImportedVectorFrame> &frames)
{
    QRectF bounds;
    bool hasBounds = false;
    for (const PaintOpenGLWidget::ImportedVectorFrame &frame : frames) {
        for (const PaintOpenGLWidget::ImportedVectorStroke &stroke : frame.strokes) {
            const QRectF strokeBounds = stroke.path.isEmpty()
                                            ? QRectF()
                                            : stroke.path.boundingRect();
            if (!strokeBounds.isValid()) {
                continue;
            }
            if (!hasBounds) {
                bounds = strokeBounds;
                hasBounds = true;
            } else {
                bounds = bounds.united(strokeBounds);
            }
        }
    }
    return bounds;
}

void scaleImportedVectorFramesToCanvas(QVector<PaintOpenGLWidget::ImportedVectorFrame> *frames, const QSizeF &targetSize)
{
    if (!frames || targetSize.width() <= 0.0 || targetSize.height() <= 0.0) {
        return;
    }

    const QRectF sourceBounds = importedVectorFramesBounds(*frames);
    if (!sourceBounds.isValid() || sourceBounds.width() <= 0.0 || sourceBounds.height() <= 0.0) {
        return;
    }

    const qreal scaleX = targetSize.width() / sourceBounds.width();
    const qreal scaleY = targetSize.height() / sourceBounds.height();
    const qreal scale = std::min(scaleX, scaleY);
    const QPointF sourceCenter = sourceBounds.center();
    const QPointF targetCenter(targetSize.width() * 0.5, targetSize.height() * 0.5);

    for (PaintOpenGLWidget::ImportedVectorFrame &frame : *frames) {
        for (PaintOpenGLWidget::ImportedVectorStroke &stroke : frame.strokes) {
            for (QPointF &point : stroke.points) {
                point = targetCenter + (point - sourceCenter) * scale;
            }
            const qreal dx = targetCenter.x() - sourceCenter.x() * scale;
            const qreal dy = targetCenter.y() - sourceCenter.y() * scale;
            const QTransform transform(scale, 0.0, 0.0, scale, dx, dy);
            stroke.path = transform.map(stroke.path);
            stroke.width = std::max(qreal(1.0), stroke.width * scale);
        }
    }
}
}

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
    , m_business(new AnimeanBusiness(this))
{
    ui->setupUi(this);
    connect(m_business, &AnimeanBusiness::statusMessageChanged, this, [this](const QString &message) {
        statusBar()->showMessage(message);
    });
    connect(m_business, &AnimeanBusiness::windowTitleChanged, this, &MainWindow::setWindowTitle);
    connect(m_business, &AnimeanBusiness::requestSurfaceTextureView, this, &MainWindow::showTextureView);
    connect(m_business, &AnimeanBusiness::requestAutoFitTextureControlView,
            this, &MainWindow::autoFitTextureControlView);
    connect(m_business, &AnimeanBusiness::requestClearTimelineThumbnails, this, [this]() {
        if (m_timeline) {
            m_timeline->clearThumbnails();
        }
    });

    setupDocks();
    setupListDragDrop();
    setupConnections();

    for (PaintOpenGLWidget *view : m_paintViews) {
        updateAttention(view,
                        AttentionChange::FrameChange,
                        view->model().currentFrame(),
                        view->model().currentLayer(),
                        view->model().currentAsset());
    }
    updateWindowTitle();
    // Queued: the dialog is modal, so running it from the constructor would
    // block before the window is laid out or shown - the user would meet a
    // floating dialog with no app behind it, and it could not centre itself.
    QMetaObject::invokeMethod(this, [this]() {
        promptForNewCanvasOnStartup();
    }, Qt::QueuedConnection);
#ifdef ANIMEAN_WITH_PYTHON
    registerAnimeanUiScene(&m_childPaintWidget->model());
    registerAnimeanUiScene(&m_paintWidget->model());
    // A script can change what the tool options panel should show without
    // touching the scene at all (the Auto Mapping calculation mode lives in
    // the menu bar and decides whether RDP applies), so the rebuild is its
    // own callback rather than a fifth flag on the scene refresh.
    registerAnimeanUiToolOptionsCallback([this]() {
        // Built-in tools (no extra tool armed) rebuild through the plain
        // tool-options path; refreshExtraToolOptions early-returns for them,
        // which would make ui.refresh_tool_options() a silent no-op on Pen
        // and Fill — exactly where the palette control lives.
        if (m_business->activeExtraTool().isEmpty()) {
            m_business->refreshToolOptions();
        } else {
            m_business->refreshExtraToolOptions();
        }
    });
    registerAnimeanUiRefreshCallback([this](bool frame, bool layer, bool asset, bool widget) {
        // EVERY view re-reads its own model, not just the active one: a
        // script can move another board's focus (a live auto-mapping run
        // moves the MAIN current layer while the texture board is active),
        // and syncing only the active view left the other widget's
        // attention cache and layerchange baseline stale - the next click
        // on that same index was then swallowed.
        m_business->syncAllViewAttentionsFromModels();
        if (frame) {
            refreshTimeline();
            // The scripted twin of the fit hook in updateAttention. This
            // callback re-reads the models directly and never goes through
            // updateAttention, so a script that moves the child board's frame
            // (ui.set_current writes the model, scene.set_current_frame writes
            // it too) and then calls ui.refresh() would otherwise leave the
            // sub-control covering the PREVIOUS frame's rectangle. Gated on
            // the frame really having moved since the last fit: `frame` here
            // is a refresh flag, not a change, and scripts raise it dozens of
            // times per run.
            if (m_childPaintWidget
                && m_childPaintWidget->model().currentFrame() != m_textureAutoFitFrame) {
                autoFitTextureControlView();
            }
        }
        if (layer) {
            refreshLayerLists();
        }
        if (asset) {
            refreshAssetList(attentionFor(assetPanelTarget()).asset);
        }
        if (widget) {
            for (PaintOpenGLWidget *paintView : m_paintViews) {
                // modelReplaced, not update: a script can change the page
                // (set_canvas_size) as easily as it can change a stroke, and
                // a bare repaint would leave the pan and the scroll bars on
                // the old one - with the new area unreachable by scrolling.
                paintView->modelReplaced();
            }
        }
        syncEmbeddedPythonState();
    });
    registerAnimeanUiFreezeCallback([this](bool frozen) {
        setPythonUiFrozen(frozen);
    });
    // Same shape as freeze: Python asks the shell by name, the shell owns
    // which windows exist and what a page is. A name that resolves to nothing
    // is a no-op here and an empty answer in list(), never a guess.
    AnimeanWindowsApi windows;
    windows.list = [this]() {
        QVector<AnimeanWindowInfo> infos;
        infos.reserve(m_parentWindows.size() + 1);
        // The central area is a window by every measure Python cares about -
        // it has a name, pages and a current page - and by none of the ones it
        // does not: it cannot be hidden, so show() on it is a no-op below
        // rather than an error. It leads the list because it is where the
        // drawing is.
        if (m_centralArea) {
            AnimeanWindowInfo info;
            info.name = m_centralArea->name();
            info.title = QStringLiteral("Paint");
            info.visible = true;
            info.pages = m_centralArea->pageNames();
            info.current = m_centralArea->currentPage();
            infos.append(info);
        }
        for (ParentWindow *window : m_parentWindows) {
            if (!window) {
                continue;
            }
            AnimeanWindowInfo info;
            info.name = window->name();
            info.title = window->windowTitle();
            // isHidden, not isVisible: the question is whether the user has
            // this window turned on, and every dock reads as invisible until
            // the main window itself is shown.
            info.visible = !window->isHidden();
            info.pages = window->pageNames();
            info.current = window->currentPage();
            infos.append(info);
        }
        return infos;
    };
    windows.show = [this](const QString &name, bool on) {
        // The central area has no hidden state to ask for; a script that says
        // show("paint") is asking for something that is already true.
        if (m_centralArea && name == m_centralArea->name()) {
            return;
        }
        if (ParentWindow *window = parentWindowNamed(name)) {
            window->setVisible(on);
            if (on) {
                window->raise();
            }
        }
    };
    windows.select = [this](const QString &name, const QString &page) {
        if (m_centralArea && name == m_centralArea->name()) {
            m_centralArea->selectPage(page);
            return;
        }
        if (ParentWindow *window = parentWindowNamed(name)) {
            window->selectPage(page);
        }
    };
    registerAnimeanUiWindowsCallback(std::move(windows));
    registerAnimeanUiOverlayCallback([this](const QString &view, const QVector<AnimeanOverlayItem> &items) {
        PaintOpenGLWidget *target = m_paintWidget;
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            if (paintView->viewName() == view) {
                target = paintView;
                break;
            }
        }
        QVector<PaintOpenGLWidget::OverlayItem> converted;
        converted.reserve(items.size());
        for (const AnimeanOverlayItem &item : items) {
            PaintOpenGLWidget::OverlayItem overlayItem;
            overlayItem.id = item.id;
            overlayItem.points = item.points;
            overlayItem.closed = item.closed;
            overlayItem.strokeColor = item.strokeColor;
            overlayItem.fillColor = item.fillColor;
            overlayItem.width = item.width;
            overlayItem.penStyle = item.penStyle;
            overlayItem.removable = item.removable;
            overlayItem.confirmable = item.confirmable;
            overlayItem.draggable = item.draggable;
            converted.append(overlayItem);
        }
        target->setOverlayItems(converted);
    });
    registerAnimeanUiEditHandleCallback([this](const QString &view, const QVector<AnimeanEditHandle> &handles) {
        PaintOpenGLWidget *target = m_paintWidget;
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            if (paintView->viewName() == view) {
                target = paintView;
                break;
            }
        }
        QVector<PaintOpenGLWidget::EditHandle> converted;
        converted.reserve(handles.size());
        for (const AnimeanEditHandle &handle : handles) {
            PaintOpenGLWidget::EditHandle editHandle;
            editHandle.id = handle.id;
            editHandle.pos = handle.pos;
            editHandle.shape = handle.shape;
            editHandle.color = handle.color;
            editHandle.interactive = handle.interactive;
            converted.append(editHandle);
        }
        target->setEditHandles(converted);
    });
    // ui.set_cursor(view, name): the tool decides WHICH affordance sits under
    // the pointer, the view knows how to draw the name. Routed by view name
    // like the overlay and handle channels.
    registerAnimeanUiCursorCallback([this](const QString &view, const QString &name) {
        PaintOpenGLWidget *target = m_paintWidget;
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            if (paintView->viewName() == view) {
                target = paintView;
                break;
            }
        }
        target->setScriptCursor(name);
    });
    // ui.set_fill_paint_mode(view, on): routed by view name like the cursor and
    // overlay channels. An unknown name is a no-op rather than a guess - the
    // mode changes what a gesture MEANS, and guessing the board would change
    // it on the wrong one.
    registerAnimeanUiFillPaintModeCallback([this](const QString &view, bool on) {
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            if (paintView->viewName() == view) {
                paintView->setFillPaintMode(on);
                return;
            }
        }
        appendPythonDebugMessage(QStringLiteral("[fill paint] unknown view '%1'").arg(view));
    });
    registerAnimeanUiLockedToolsCallback([this](const QString &view, const QStringList &tools) {
        m_business->applyLockedTools(view, tools);
    });
    registerAnimeanUiDrawColorCallback([this](const QColor &color) {
        m_business->setDrawingColor(color);
    });
    registerAnimeanUiDrawSettingsCallback([this](int stabilizer, int simplify, int corner) {
        // The tool panel shows the stabilizer as its "Smooth" slider, so a
        // change made in the Draw Setting window has to be reflected there.
        m_business->setDrawSettings(stabilizer, simplify, corner);
    });
    registerAnimeanUiHistoryCallback([this](const QString &op, const QString &viewName, const QString &label) {
        PaintOpenGLWidget *named = nullptr;
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            if (paintView->viewName() == viewName) {
                named = paintView;
                break;
            }
        }
        if (!viewName.isEmpty() && !named) {
            // Unknown view name: doing nothing beats acting on a guess.
            appendPythonDebugMessage(QStringLiteral("[history] unknown view '%1'").arg(viewName));
            return;
        }
        if (op == QStringLiteral("commit")) {
            m_business->commitHistory(label.isEmpty() ? QStringLiteral("Python") : label, viewName);
        } else if (op == QStringLiteral("undo")) {
            m_business->undo(viewName);
        } else if (op == QStringLiteral("redo")) {
            m_business->redo(viewName);
        }
    });
    syncEmbeddedPythonState();
    appendPythonDebugMessage(QStringLiteral(
        "[python register] animean_python, animemodel, ui, model, current, model_pybind, vectorlogic, canvas_width, canvas_height, "
        "main_model, child_model, active_view"));
    runPythonInitializationScript();
    // The first tool options panel is built inside setupDocks(), which runs
    // BEFORE the scenes are registered above - so any scene-scoped control
    // (the palette's swatch set) was built against no scene at all. Rebuild it
    // once now that Python can see the document it belongs to.
    refreshToolOptions();
#endif
}

MainWindow::~MainWindow()
{
    // The sub-control registry's keeper is a top-level widget that outlives
    // this window, so anything parked in it would outlive the shell that
    // registered its scene. Take both halves of the texture view back first:
    // the frame goes now, the panel becomes an ordinary child and dies with
    // the rest of the window.
    if (m_texturePanel) {
        // Out of whichever home it is in FIRST: deleting the frame while the
        // panel is still parented inside it would take the board with it.
        if (m_textureFrame) {
            m_textureFrame->releaseContent();
        }
        if (m_centralArea) {
            m_centralArea->setTextureContent(nullptr);
        }
        m_texturePanel->setParent(this);
        m_texturePanel->hide();
        m_textureHome = nullptr;
    }
    delete m_textureFrame;
    m_textureFrame = nullptr;
#ifdef ANIMEAN_WITH_PYTHON
    clearAnimeanUiHistoryCallback();
    clearAnimeanUiLockedToolsCallback();
    clearAnimeanUiFillPaintModeCallback();
    clearAnimeanUiDrawColorCallback();
    clearAnimeanUiOverlayCallback();
    clearAnimeanUiFreezeCallback();
    clearAnimeanUiWindowsCallback();
    clearAnimeanUiRefreshCallback();
    unregisterAnimeanUiScene(&m_childPaintWidget->model());
    unregisterAnimeanUiScene(&m_paintWidget->model());
#endif
    delete ui;
}

AnimeanBusiness *MainWindow::business() const
{
    return m_business;
}

void MainWindow::bindPaintViewToBusiness(PaintOpenGLWidget *view)
{
    if (!m_business || !view) {
        return;
    }

    AnimePaintViewAdapter adapter;
    adapter.viewObject = view;
    adapter.model = &view->model();
    adapter.history = &view->history();
    adapter.modelReplaced = [view]() { view->modelReplaced(); };
    adapter.setCanvasSize = [view](const QSize &size) { view->setCanvasSize(size); };
    adapter.requestUpdate = [view]() { view->update(); };
    adapter.setCurrentFrame = [view](int frame) { view->setCurrentFrame(frame); };
    adapter.setCurrentLayer = [view](int layer) { view->setCurrentLayer(layer); };
    adapter.setCurrentAsset = [view](int asset) { view->setCurrentAsset(asset); };

    adapter.commitHistory = [view](const QString &label) { view->commitHistory(label); };
    adapter.resetHistory = [view](const QString &label) { view->resetHistory(label); };
    adapter.dropRedoTail = [view]() { view->dropRedoTail(); };
    adapter.undoHistory = [view]() { return view->undoHistory(); };
    adapter.redoHistory = [view]() { return view->redoHistory(); };
    adapter.goToHistory = [view](int index) { return view->goToHistory(index); };

    adapter.addLayer = [view]() { return view->addLayer(); };
    adapter.deleteLayer = [view](int layerIndex) { return view->deleteLayer(layerIndex); };
    adapter.deleteLayerGroup = [view](int groupId) { return view->deleteLayerGroup(groupId); };
    adapter.moveLayer = [view](int from, int to) { return view->moveLayer(from, to); };
    adapter.sendLayerVisibilityMessage = [view](int layerIndex, bool visible) {
        return view->sendPythonLayerVisibilityMessage(layerIndex, visible);
    };

    adapter.addFrame = [view]() { return view->addFrame(); };
    adapter.insertHoldFrameAfter = [view](int row) { return view->insertHoldFrameAfter(row); };
    adapter.duplicateFrame = [view](int row) { return view->duplicateFrame(row); };
    adapter.deleteFrame = [view](int row) { return view->deleteFrame(row); };
    adapter.moveFrame = [view](int from, int to) { return view->moveFrame(from, to); };

    adapter.addAsset = [view](AnimeColumnType type, const QString &name) {
        return view->addAsset(type, name);
    };
    adapter.assignAssetToLayer = [view](int layerIndex, int assetIndex) {
        return view->assignAssetToLayer(layerIndex, assetIndex);
    };
    adapter.addLayerForAsset = [view](int assetIndex) {
        return view->addLayerForAsset(assetIndex);
    };

    adapter.setTool = [view](int tool) {
        view->setTool(static_cast<PaintOpenGLWidget::Tool>(tool));
    };
    adapter.currentTool = [view]() { return int(view->tool()); };
    adapter.setStrokeProperty = [view](const QString &prop) { view->setStrokeProperty(prop); };
    adapter.setDrawingColor = [view](const QColor &color) { view->setDrawingColor(color); };
    adapter.setPenWidth = [view](qreal width) { view->setPenWidth(width); };
    adapter.setFillScope = [view](int scope) {
        view->setFillScope(static_cast<PaintOpenGLWidget::FillScope>(scope));
    };
    adapter.setSmoothValue = [view](int value) { view->setSmoothValue(value); };
    adapter.setStrokeFitSettings = [view](const AnimeStrokeFitSettings &settings) {
        view->setStrokeFitSettings(settings);
    };
    adapter.sendExtraToolMessage = [view](const QString &name, const QString &prop) {
        view->sendPythonExtraToolMessage(name, prop);
    };
    adapter.sendToolOptionMessage = [view](const QString &hook, const QString &name,
                                           const QString &type, const QVariant &value,
                                           int row, int startCol, int endCol) {
        view->sendPythonToolOptionMessage(hook, name, type, value, row, startCol, endCol);
    };
    adapter.sendPadMessage = [view](const QString &pad, const QString &phase, double x, double y) {
        view->sendPythonPadMessage(pad, phase, x, y);
    };

    adapter.buildPlaybackCache = [view](int frameCount, QString *error) {
        return view->buildPlaybackCache(frameCount, error);
    };
    adapter.showPlaybackFrame = [view](int index) { view->showPlaybackFrame(index); };
    adapter.endPlayback = [view]() { view->endPlayback(); };

    adapter.setOnionEnabled = [view](bool enabled) { view->setOnionEnabled(enabled); };
    adapter.setOnionFrames = [view](const QSet<int> &frames) { view->setOnionFrames(frames); };
    adapter.setOnionLines = [view](bool enabled) { view->setOnionLines(enabled); };
    adapter.setOnionFills = [view](bool enabled) { view->setOnionFills(enabled); };
    adapter.setOnionAmLayers = [view](bool enabled) { view->setOnionAmLayers(enabled); };
    adapter.setOnionGuideLines = [view](bool enabled) { view->setOnionGuideLines(enabled); };
    adapter.setOnionExcludeProperties = [view](const QStringList &props) {
        view->setOnionExcludeProperties(props);
    };
    adapter.setOnionLayerTag = [view](const QString &tag) { view->setOnionLayerTag(tag); };

    adapter.renderFrameThumbnail = [view](int frame, const QSize &size) {
        return view->renderFrameThumbnail(frame, size);
    };

    m_business->bindPaintView(view->viewName(), adapter);
}

void MainWindow::setupDocks()
{
    setDockOptions(QMainWindow::AnimatedDocks
                   | QMainWindow::AllowNestedDocks
                   | QMainWindow::AllowTabbedDocks);
    setCorner(Qt::BottomLeftCorner, Qt::BottomDockWidgetArea);
    setCorner(Qt::BottomRightCorner, Qt::BottomDockWidgetArea);

    // Three-section workspace: Tools on the left, panels on the right, the
    // central paint area anchored as the central widget (only a central widget
    // absorbs window growth correctly), and the timeline (left+middle) +
    // python debug (right) along the bottom. The texture board is no longer a
    // dock of its own - it is the central area's second page, or a sub-control
    // inside another panel.
    createMainPaintView();
    createTexturePanel();
    m_activePaintWidget = m_paintWidget;
    m_paintViews = {m_paintWidget, m_childPaintWidget};
    bindPaintViewToBusiness(m_paintWidget);
    bindPaintViewToBusiness(m_childPaintWidget);
    if (m_texturePanel) {
        m_business->setChangeableTimeline(m_texturePanel->changableTimeline());
        m_business->setChangeableTexture(m_texturePanel->changableTexture());
    }
    m_paintWidget->setActiveIndicator(true);
    createListDocks();
    // After createListDocks: the timeline hangs off the main view's container
    // and replaces the frames dock, so it is created with the other surfaces.
    createTimeline();
    createToolDocks();
    // After createToolDocks: importing extra_tools there pulls in the tool
    // modules, whose import-time registrations fill the view-button registry.
    populateChildViewButtons();
    setupPythonDebugDock();
    createTextureFileMenu();
    // The same entries on the application File menu: the texture board is not
    // always on screen (it can be parked), and its own bar goes with it.
    createMainTextureMenu();
    // After the View menu below would be too late to matter, but after the
    // tool modules are imported is what counts: their import-time
    // registrations are what these menus are built from.
    createScriptMenus();
    attachChildScriptMenus();
    pullOnionPolicy();
    // Re-baseline both histories now that the views carry their fixed scene
    // identities; the constructor-time baseline predates setTextId/setIntId
    // and undoing into it would corrupt the main/child identity invariant.
    m_business->resetHistory(QStringLiteral("Initial"), QStringLiteral("main"));
    m_business->resetHistory(QStringLiteral("Initial"), QStringLiteral("child"));
    createHistoryDock();
    createForcePadDock();

    // Theme sits left of Windows: it changes how every panel LOOKS, while
    // Windows changes which ones exist.
    QMenu *themeMenu = menuBar()->addMenu(QStringLiteral("Theme"));
    QActionGroup *themeGroup = new QActionGroup(this);
    QAction *darkThemeAction = themeMenu->addAction(QStringLiteral("Dark"));
    QAction *lightThemeAction = themeMenu->addAction(QStringLiteral("Light"));
    for (QAction *action : {darkThemeAction, lightThemeAction}) {
        action->setCheckable(true);
        themeGroup->addAction(action);
    }
    darkThemeAction->setChecked(AnimeTheme::mode() == AnimeTheme::Mode::Dark);
    lightThemeAction->setChecked(AnimeTheme::mode() == AnimeTheme::Mode::Light);
    connect(darkThemeAction, &QAction::triggered, this, []() {
        AnimeTheme::setMode(AnimeTheme::Mode::Dark);
    });
    connect(lightThemeAction, &QAction::triggered, this, []() {
        AnimeTheme::setMode(AnimeTheme::Mode::Light);
    });
    connect(AnimeTheme::instance(), &AnimeTheme::themeChanged, this, [this]() {
        // The boards paint their surround and page edge from the theme, and
        // the history list bakes the redo tail's colour into its items; a new
        // application palette reaches neither on its own.
        for (PaintOpenGLWidget *view : m_paintViews) {
            view->update();
        }
        refreshHistoryList();
    });

    // "Windows", not "View": every entry here shows or hides a PANEL. What is
    // drawn on the canvas is a different question, and it now has its own
    // View menu (script-provided, per board) so the two cannot be confused.
    QMenu *windowsMenu = menuBar()->addMenu(QStringLiteral("Windows"));
    // Not a dock toggle any more: the texture board rides a SUB-CONTROL, and
    // what this entry does is bring that control back to where it can be seen
    // - floating it when it has never been dropped into a panel.
    QAction *textureViewAction = windowsMenu->addAction(QStringLiteral("Texture View"));
    textureViewAction->setToolTip(
        QStringLiteral("Show the texture board's sub-control; drag its title bar onto a "
                       "panel to dock it."));
    connect(textureViewAction, &QAction::triggered, this, &MainWindow::showTextureSubControl);
    windowsMenu->addSeparator();
    // Parent windows: the menu shows ONE line per window, and its pages are
    // reached by their tabs. The timeline is not one of them - it has no page
    // tabs - but it IS a dock, so it carries the same inherited toggle.
    m_parentWindows = {m_toolsDock, m_toolOptDock, m_layerDock, m_assetDock,
                       m_historyDock, m_forcePadDock, m_pythonDebugDock};
    for (ParentWindow *window : m_parentWindows) {
        if (window) {
            windowsMenu->addAction(window->toggleViewAction());
        }
    }
    if (m_timeline) {
        windowsMenu->addAction(m_timeline->toggleViewAction());
    }

    // NOTE: deliberately NO resizeDocks anywhere here — measured against Qt
    // 6.9.1 a horizontal call on the bottom band pins it at its minimum height
    // for good. The only one that used to survive was the vertical share the
    // texture DOCK took from the Tools dock, and there is no texture dock any
    // more: the left column is Tools alone, which needs no nudge.
}

void MainWindow::createMainPaintView()
{
    m_centralArea = new CentralPaintArea(this);
    if (QWidget *central = takeCentralWidget()) {
        central->deleteLater();
    }
    setCentralWidget(m_centralArea);

    // The Drawing page's container is still the resize-absorbing centre; the
    // tab strip above it is 24px of chrome, not a competing layout.
    m_paintWidget = m_centralArea->mainContainer()->paintWidget();
    m_paintWidget->setViewName(QStringLiteral("main"));
    m_paintWidget->model().setTextId(QStringLiteral("main_paint_view"));
    m_paintWidget->model().setIntId(1);

    connect(m_centralArea, &CentralPaintArea::pageChanged, this, [this](const QString &page) {
        // The page selection is half of the texture board's ownership rule, so
        // it has to re-run before anything else reacts.
        updateTextureHome();
        if (page == QStringLiteral("texture")) {
            if (m_childPaintWidget) {
                setActivePaintView(m_childPaintWidget);
            }
        } else if (m_paintWidget) {
            setActivePaintView(m_paintWidget);
        }
    });
}

void MainWindow::showMainPaintView()
{
    // The main view is the central widget's Drawing page: never hidden, but it
    // can be behind the Texture tab.
    if (m_centralArea) {
        m_centralArea->selectPage(QStringLiteral("drawing"));
    }
    setActivePaintView(m_paintWidget);
}

void MainWindow::startPlayback()
{
    if (m_business->isPlaybackActive()) {
        return;
    }

    PaintOpenGLWidget *view = framePanelTarget();
    const int frameCount = view ? view->frameCount() : 0;
    if (frameCount >= 2) {
        QApplication::setOverrideCursor(Qt::WaitCursor);
        setStatusText(QStringLiteral("Prerendering %1 frames...").arg(frameCount));
        QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
    }
    m_business->startPlayback();
    if (frameCount >= 2) {
        QApplication::restoreOverrideCursor();
    }
    if (m_business->isPlaybackActive() && m_timeline) {
        m_timeline->setPlaybackActive(true);
    }
}

void MainWindow::advancePlaybackFrame()
{
    m_business->advancePlaybackFrame();
}

void MainWindow::stopPlayback()
{
    if (!m_business->isPlaybackActive()) {
        return;
    }
    m_business->stopPlayback();
    if (m_timeline) {
        m_timeline->setPlaybackActive(false);
    }
}

void MainWindow::createForcePadDock()
{
    m_forcePadPanel = new ForcePadPanel(this);
    m_forcePadDock = new ParentWindow(QStringLiteral("repulsion_pad"),
                                      QStringLiteral("Repulsion Pad"), this);
    m_forcePadDock->addPage(QStringLiteral("repulsion_pad"), QStringLiteral("Repulsion Pad"),
                            m_forcePadPanel);
    addDockWidget(Qt::RightDockWidgetArea, m_forcePadDock);
    // Hidden by default: it is a special-purpose tool surface; the View menu
    // toggle brings it up.
    m_forcePadDock->hide();

    // The pad itself is a generic vector input. Routing its phases into the
    // Python hook system ("pad" event, pad name "force_pad") is the only tool
    // coupling; the repulsion semantics live in pyfile/repulsion_tool.py.
    connect(m_forcePadPanel, &ForcePadPanel::padPressed, this, [this](double x, double y) {
        m_business->sendPadEvent(QStringLiteral("force_pad"), QStringLiteral("press"), x, y);
    });
    connect(m_forcePadPanel, &ForcePadPanel::padMoved, this, [this](double x, double y) {
        m_business->sendPadEvent(QStringLiteral("force_pad"), QStringLiteral("move"), x, y);
    });
    connect(m_forcePadPanel, &ForcePadPanel::padReleased, this, [this](double x, double y) {
        m_business->sendPadEvent(QStringLiteral("force_pad"), QStringLiteral("release"), x, y);
    });

#ifdef ANIMEAN_WITH_PYTHON
    // Lets Python recenter the latched handle when its baseline dies
    // (ui.set_pad_value("force_pad", 0, 0)).
    registerAnimeanUiPadValueCallback([this](const QString &pad, double x, double y) {
        if (pad == QStringLiteral("force_pad") && m_forcePadPanel) {
            m_forcePadPanel->setValue(QPointF(x, y));
        }
    });
#endif
}

void MainWindow::createHistoryDock()
{
    m_historyPanel = new HistoryPanel(this);
    m_historyDock = new ParentWindow(QStringLiteral("history"), QStringLiteral("History"), this);
    m_historyDock->addPage(QStringLiteral("history"), QStringLiteral("History"), m_historyPanel);
    addDockWidget(Qt::RightDockWidgetArea, m_historyDock);
    // Hidden by default: undo/redo are on the keyboard, so the list is for
    // the times you want to jump around history rather than everyday work.
    // The View menu toggle brings it up.
    m_historyDock->hide();

    m_undoAction = new QAction(QStringLiteral("Undo"), this);
    m_undoAction->setShortcut(QKeySequence::Undo);
    connect(m_undoAction, &QAction::triggered, this, [this]() {
        m_business->undo();
    });
    ui->menuEdit->addAction(m_undoAction);

    m_redoAction = new QAction(QStringLiteral("Redo"), this);
    m_redoAction->setShortcuts({QKeySequence::Redo, QKeySequence(QStringLiteral("Ctrl+Shift+Z"))});
    connect(m_redoAction, &QAction::triggered, this, [this]() {
        m_business->redo();
    });
    ui->menuEdit->addAction(m_redoAction);

    for (PaintOpenGLWidget *view : m_paintViews) {
        connect(view, &PaintOpenGLWidget::historyChanged,
                this, &MainWindow::scheduleHistoryRefresh);
        // Global-inverse redo semantics: a new edit anywhere invalidates the
        // redo future everywhere, so Ctrl+Y can never resurrect an operation
        // whose chronological context is gone.
        connect(view, &PaintOpenGLWidget::historyCommitted, this, [this, view]() {
            m_business->handleViewHistoryCommitted(view->viewName());
        });
    }

    connect(m_historyPanel->historyList(), &QListWidget::currentRowChanged, this, [this](int row) {
        if (m_refreshingHistory || row < 0) {
            return;
        }
        if (!m_business->goToHistory(row)) {
            scheduleHistoryRefresh();
        }
    });

    refreshHistoryList();
}

// Undo follows true chronology across both views: pick the view whose current
// entry is the most recent commit anywhere.
PaintOpenGLWidget *MainWindow::undoTargetView() const
{
    const QString target = m_business->undoTargetViewName();
    if (target.isEmpty()) {
        return nullptr;
    }
    return target == QStringLiteral("child") ? m_childPaintWidget : m_paintWidget;
}

// Redo is the mirror: re-apply the oldest not-yet-redone commit first.
PaintOpenGLWidget *MainWindow::redoTargetView() const
{
    const QString target = m_business->redoTargetViewName();
    if (target.isEmpty()) {
        return nullptr;
    }
    return target == QStringLiteral("child") ? m_childPaintWidget : m_paintWidget;
}

void MainWindow::scheduleHistoryRefresh()
{
    // Rebuilding the list synchronously from inside its own signal handlers
    // (or mid mouse-press) shifts the viewport under the click; coalesce and
    // defer to the event loop instead.
    if (m_historyRefreshQueued) {
        return;
    }
    m_historyRefreshQueued = true;
    QMetaObject::invokeMethod(this, [this]() {
        m_historyRefreshQueued = false;
        refreshHistoryList();
    }, Qt::QueuedConnection);
}

void MainWindow::refreshHistoryList()
{
    if (!m_historyPanel) {
        return;
    }

    PaintOpenGLWidget *view = activePaintWidget();
    const QString viewName = view->viewName();
    const QStringList labels = m_business->historyLabels(viewName);
    const int currentIndex = m_business->currentHistoryIndex(viewName);
    QListWidget *list = m_historyPanel->historyList();

    m_refreshingHistory = true;
    const QSignalBlocker blocker(list);
    list->clear();
    for (int i = 0; i < labels.size(); ++i) {
        QListWidgetItem *item = new QListWidgetItem(
            QStringLiteral("%1. %2").arg(i + 1).arg(labels.at(i)));
        if (i > currentIndex) {
            // The redo tail is "there but not in effect" - the same thing the
            // palette's disabled text says, in whatever theme is on.
            item->setForeground(list->palette().color(QPalette::Disabled, QPalette::Text));
        }
        list->addItem(item);
    }
    list->setCurrentRow(currentIndex);
    list->scrollToItem(list->currentItem());
    m_refreshingHistory = false;

    if (m_historyDock) {
        m_historyDock->setWindowTitle(QStringLiteral("History - %1").arg(viewName));
    }
    if (m_undoAction) {
        m_undoAction->setEnabled(m_business->canUndo());
    }
    if (m_redoAction) {
        m_redoAction->setEnabled(m_business->canRedo());
    }
}

void MainWindow::applyHistoryRestore(PaintOpenGLWidget *view)
{
    if (!view) {
        return;
    }
    m_business->applyHistoryRestore(view->viewName());
}

void MainWindow::createTexturePanel()
{
    // Born PARKED, not as a loose child of the window: an unlaid-out child of
    // a QMainWindow paints itself over the top-left corner the moment the
    // window is shown. The router below gives it a real home.
    m_texturePanel = new TexturePanel(SubControlRegistry::instance()->keeper());
    m_childPaintWidget = m_texturePanel->paintWidget();
    m_childPaintWidget->model().setTextId(QStringLiteral("child_paint_view"));
    m_childPaintWidget->model().setIntId(2);
    connect(m_texturePanel, &TexturePanel::scriptButtonToggled, this,
            [this](const QString &name, bool on) {
                m_childPaintWidget->sendPythonViewButtonMessage(name, on);
            });

    // The travelling half: a named frame the tool panels can adopt by
    // declaration ({"type":"subwindow","name":"texture_view"}) or by drag.
    // It exists from startup so a layout built before the user has ever
    // opened the texture view still finds it.
    m_textureFrame = new SubControlFrame(QStringLiteral("texture_view"),
                                         QStringLiteral("Texture"), this);
    m_textureFrame->setPlaceholderText(QStringLiteral("Open in the main view"));
    // QUEUED on purpose. A tool-options rebuild parks the frame and then puts
    // it straight back at its declared slot; run inline, that pair would move
    // the board out and in again - two GL context re-creations per refresh.
    // Deferred, the second evaluation sees an unchanged answer and does
    // nothing at all.
    connect(m_textureFrame, &SubControlFrame::homeChanged, this,
            &MainWindow::updateTextureHome, Qt::QueuedConnection);

    // A hand on the wheel, the middle button or a scroll bar is the user taking
    // the framing over: auto-fit stands down for this home until the board is
    // homed into it again. Programmatic moves (the slot restore, the fit
    // itself) do not emit this, which is the whole reason the signal exists.
    connect(m_childPaintWidget, &PaintOpenGLWidget::userTransformed, this, [this]() {
        if (TextureViewSlot *slot = textureViewSlotFor(m_textureHome)) {
            slot->autoFitSuspended = true;
        }
    });

    // The central slot is SEEDED, not left empty. A slot only becomes valid on
    // the way OUT of a home, so the central one could not be valid until after
    // the board's first stay there - and the very first arrival would then
    // restore nothing and silently keep whatever the sub-control's COVER fit
    // chose for a panel row, on a board the size of the central area. The seed
    // is the board's construction-time viewpoint, which is exactly what the
    // central page showed before the per-home slots existed.
    m_textureViewCentral.zoom = m_childPaintWidget->zoom();
    m_textureViewCentral.pan = m_childPaintWidget->panOffset();
    m_textureViewCentral.valid = true;

    // The COVER fit is computed against a viewport SIZE, so growing the
    // sub-control (a dock drag, or a visible_when control collapsing a row
    // above the board) leaves the old zoom covering less than the new frame -
    // the band of empty paper the fit exists to prevent. The board itself
    // emits no resize signal, so the event is what we listen to;
    // autoFitTextureControlView already self-gates on the home and on the
    // suspension, so a resize in any other home costs one comparison.
    m_childPaintWidget->installEventFilter(this);

    // The panel starts on the central Texture page's side of the rule: parked,
    // because the Drawing page is what comes up first.
    updateTextureHome();
}

void MainWindow::updateTextureHome()
{
    if (!m_texturePanel || m_updatingTextureHome) {
        return;
    }
    // Reparenting the panel moves a QOpenGLWidget, which fires show/hide
    // events that come straight back here. One pass at a time.
    m_updatingTextureHome = true;

    // The rule, in priority order: the central Texture page owns the board
    // whenever it is selected, then a live sub-control frame, then nowhere.
    const bool centralWantsIt = m_centralArea
                                && m_centralArea->currentPage() == QStringLiteral("texture");
    QWidget *wanted = nullptr;
    if (centralWantsIt) {
        wanted = m_centralArea;
    } else if (m_textureFrame && m_textureFrame->isLive()) {
        wanted = m_textureFrame;
    }

    if (wanted != m_textureHome) {
        // Never mid-gesture. A button down anywhere means either a stroke on
        // this board (a reparent would destroy the context it is drawing into)
        // or the frame drag that asked for this move in the first place, which
        // is not finished until the button comes up. Poll rather than
        // single-shot at zero: a zero timer re-arms itself every event loop
        // pass and spins for the length of the drag.
        if (QApplication::mouseButtons() != Qt::NoButton) {
            m_updatingTextureHome = false;
            QTimer::singleShot(50, this, &MainWindow::updateTextureHome);
            return;
        }

        // BEFORE anything moves: the reparent resizes the board into its new
        // home, and the resize's own pan clamp would rewrite the very transform
        // this is trying to remember.
        saveTextureViewSlot(m_textureHome);

        if (m_centralArea && m_textureHome == m_centralArea) {
            m_centralArea->setTextureContent(nullptr);
        } else if (m_textureFrame && m_textureHome == m_textureFrame) {
            m_textureFrame->releaseContent();
        }

        m_textureHome = wanted;
        if (wanted == m_centralArea) {
            m_texturePanel->setCompact(false);
            m_centralArea->setTextureContent(m_texturePanel);
        } else if (wanted == m_textureFrame) {
            // A board inside a tool-options row cannot hold the full-size
            // floor open; the frame relaxes it and the container scales.
            m_texturePanel->setCompact(true);
            m_textureFrame->setContent(m_texturePanel);
        } else {
            m_texturePanel->setParent(SubControlRegistry::instance()->keeper());
            m_texturePanel->hide();
        }
        // No cache invalidation is owed here: the onion cache is a MAIN-board
        // feature (the texture board is a reference, not a run of drawings),
        // and the widget owns no GL resources of its own - it is QPainter on
        // GL, so the context Qt re-creates on a reparent had nothing in it.
        // A repaint at the new size is all the move costs.
        if (m_childPaintWidget) {
            m_childPaintWidget->update();
        }

        // QUEUED, for the same reason the save above is not: the board has just
        // been handed to a new parent and does not have its new size until the
        // layout has run. A viewpoint restored - or worse, a fit computed -
        // against the old size frames the wrong rectangle.
        m_textureViewRestoreRetries = 0;
        QTimer::singleShot(0, this, &MainWindow::restoreTextureViewSlot);
    }

    // The frame always says something: the board when it has it, otherwise
    // where the board went.
    if (m_textureFrame) {
        m_textureFrame->setPlaceholderText(centralWantsIt
                                               ? QStringLiteral("Open in the main view")
                                               : QStringLiteral("The texture board is parked"));
    }
    m_updatingTextureHome = false;
}

MainWindow::TextureViewSlot *MainWindow::textureViewSlotFor(QWidget *home)
{
    if (!home) {
        return nullptr;
    }
    if (m_centralArea && home == m_centralArea) {
        return &m_textureViewCentral;
    }
    if (m_textureFrame && home == m_textureFrame) {
        return &m_textureViewControl;
    }
    // Parked. Nothing to remember, and nothing that could have moved it.
    return nullptr;
}

void MainWindow::saveTextureViewSlot(QWidget *home)
{
    TextureViewSlot *slot = textureViewSlotFor(home);
    if (!slot || !m_childPaintWidget) {
        return;
    }
    slot->zoom = m_childPaintWidget->zoom();
    slot->pan = m_childPaintWidget->panOffset();
    slot->valid = true;
}

void MainWindow::restoreTextureViewSlot()
{
    if (!m_childPaintWidget) {
        return;
    }
    TextureViewSlot *slot = textureViewSlotFor(m_textureHome);
    if (!slot) {
        return;
    }

    if (m_childPaintWidget->width() < 2 || m_childPaintWidget->height() < 2) {
        // The layout has not sized the new home yet - a fit measured against a
        // one-pixel board is nonsense and a restored pan would clamp against
        // it. One more turn of the event loop, a bounded number of times.
        if (m_textureViewRestoreRetries < 5) {
            ++m_textureViewRestoreRetries;
            QTimer::singleShot(16, this, &MainWindow::restoreTextureViewSlot);
        }
        return;
    }
    m_textureViewRestoreRetries = 0;

    if (slot->valid) {
        // Even where the fit below is about to overrule it: it costs one
        // transform and it means a home the fit cannot compute (an empty frame
        // on the unbounded board) still shows the viewpoint it was left at
        // rather than the other home's.
        m_childPaintWidget->setViewTransform(slot->zoom, slot->pan);
    }

    if (m_textureFrame && m_textureHome == m_textureFrame) {
        // Homing in ends any suspension: the manual override was scoped to the
        // visit that made it ("until the next home-in"), and arriving is what
        // the frame's auto-fit is for.
        slot->autoFitSuspended = false;
        autoFitTextureControlView();
    }
}

void MainWindow::autoFitTextureControlView()
{
    if (!m_childPaintWidget || !m_textureFrame || m_textureHome != m_textureFrame) {
        return;
    }
    if (m_textureViewControl.autoFitSuspended) {
        return;
    }
    // CONTAIN: the content's LONG side fits the frame exactly, so the whole
    // reference is always visible; the short axis keeps a margin instead of
    // running off the edges. (User-chosen over cover after trying both.)
    if (!m_childPaintWidget->fitViewToContent(false)) {
        return;
    }
    // Remember what the fit chose, so the next arrival here has something to
    // show before its own fit lands.
    m_textureViewControl.zoom = m_childPaintWidget->zoom();
    m_textureViewControl.pan = m_childPaintWidget->panOffset();
    m_textureViewControl.valid = true;
    // Which frame this framing was computed for. The scripted refresh path
    // (see registerAnimeanUiRefreshCallback) fires many times per run and has
    // no "did it actually move" of its own, so it asks this.
    m_textureAutoFitFrame = m_childPaintWidget->model().currentFrame();
}

#ifdef ANIMEAN_WITH_PYTHON
void MainWindow::fillScriptMenu(QMenu *menu, const QString &menuName, const QJsonArray &items,
                                const QString &host, PaintOpenGLWidget *owner)
{
    for (const QJsonValue &value : items) {
        const QJsonObject object = value.toObject();
        const QString kind = object.value(QStringLiteral("kind")).toString(QStringLiteral("action"));
        if (kind == QStringLiteral("separator")) {
            menu->addSeparator();
            continue;
        }
        const QString title = object.value(QStringLiteral("title")).toString();
        if (kind == QStringLiteral("submenu")) {
            QMenu *child = menu->addMenu(title);
            fillScriptMenu(child, menuName, object.value(QStringLiteral("items")).toArray(), host, owner);
            continue;
        }
        const QString name = object.value(QStringLiteral("name")).toString();
        if (name.isEmpty()) {
            continue;
        }
        QAction *action = menu->addAction(title.isEmpty() ? name : title);
        action->setEnabled(object.value(QStringLiteral("enabled")).toBool(true));
        if (kind == QStringLiteral("settings")) {
            // Declarative rather than a call back into C++ from the handler:
            // opening a modal window from inside a menu trigger that Python
            // dispatched would re-enter the interpreter while the menu is
            // still up.
            const QString target = object.value(QStringLiteral("settings")).toString(name);
            connect(action, &QAction::triggered, this, [this, target, title]() {
                openScriptSettings(target, title);
            });
            continue;
        }
        if (kind == QStringLiteral("check") || kind == QStringLiteral("radio")) {
            action->setCheckable(true);
            action->setChecked(object.value(QStringLiteral("checked")).toBool(false));
        }
        connect(action, &QAction::triggered, this, [this, menuName, name, owner](bool checked) {
            // Through the view that OWNS this menu, never the focused one.
            // sendPythonMenuMessage stamps message["view"] from the widget it
            // goes through, and the CHECK MARK is already built from the
            // owning board - so reading the active view instead made the tick
            // and the click disagree: the main bar's Mapping Refer Rect, used
            // while the texture had focus, turned the grid on for the TEXTURE
            // and left its own tick unchecked, after which it could neither be
            // turned on nor off.
            (owner ? owner : activePaintWidget())->sendPythonMenuMessage(menuName, name, checked);
            // The handler may have changed what the panels show.
            refreshPanelTargets();
        });
    }
}

void MainWindow::rebuildScriptMenu(QMenu *menu, const QString &menuName,
                                   const QString &host, PaintOpenGLWidget *owner)
{
    // Rebuilt every time the menu opens, from Python. That is what keeps a
    // check mark honest: the state lives in the script, and asking at open
    // time means C++ never has to mirror it (and never drifts from it).
    menu->clear();
    try {
        const std::string json = py::module_::import("python_hooks")
                                     .attr("menus_json")(host.toStdString())
                                     .cast<std::string>();
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json));
        for (const QJsonValue &value : document.array()) {
            const QJsonObject object = value.toObject();
            if (object.value(QStringLiteral("name")).toString() != menuName) {
                continue;
            }
            fillScriptMenu(menu, menuName, object.value(QStringLiteral("items")).toArray(), host, owner);
            return;
        }
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("menu error: %1").arg(QString::fromUtf8(error.what())));
    }
}
#endif

void MainWindow::refreshToolOptions()
{
    // Rebuilds the tool options panel from the current tool state. Needed
    // because the Draw Setting window and the panel's own Smooth slider are
    // two views of the SAME stabilizer value.
    if (m_reloadToolOptions) {
        m_reloadToolOptions(m_currentToolForOptions);
    }
}

void MainWindow::openScriptSettings(const QString &name, const QString &title)
{
#ifdef ANIMEAN_WITH_PYTHON
    // The window is built from the SAME control schema the tool options panel
    // uses, and its changes travel down the SAME option hook, so a settings
    // window costs Python a layout description and nothing else.
    QJsonObject layout;
    try {
        const std::string json = py::module_::import("python_hooks")
                                     .attr("settings_layout_json")(name.toStdString())
                                     .cast<std::string>();
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json));
        layout = document.object();
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("settings error: %1").arg(QString::fromUtf8(error.what())));
        return;
    }
    if (layout.isEmpty()) {
        setStatusText(QStringLiteral("No settings registered for '%1'.").arg(name));
        return;
    }

    QDialog dialog(this);
    dialog.setWindowTitle(title.isEmpty() ? name : title);
    QVBoxLayout *box = new QVBoxLayout(&dialog);
    ToolOptPanel *panel = new ToolOptPanel(&dialog);
    connect(panel, &ToolOptPanel::optionChanged, this,
            [this](const QString &hook, const QString &optionName, const QString &type,
                   const QVariant &value, int row, int startColumn, int endColumn) {
        activePaintWidget()->sendPythonToolOptionMessage(hook, optionName, type, value,
                                                         row, startColumn, endColumn);
        for (PaintOpenGLWidget *view : m_paintViews) {
            view->update();
        }
    });
    panel->configureLayout(layout);
    box->addWidget(panel, 1);

    QDialogButtonBox *buttons = new QDialogButtonBox(QDialogButtonBox::Close, &dialog);
    connect(buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::accept);
    connect(buttons, &QDialogButtonBox::accepted, &dialog, &QDialog::accept);
    box->addWidget(buttons);

    // Applied live, so there is nothing to confirm: every change has already
    // gone through the option hook by the time this closes.
    dialog.exec();
#else
    Q_UNUSED(name);
    Q_UNUSED(title);
#endif
}

void MainWindow::attachChildScriptMenus()
{
#ifdef ANIMEAN_WITH_PYTHON
    // The texture panel's own menu bar, filled from host "child". Built here
    // rather than in TexturePanel because MainWindow owns the Python side
    // (the interpreter, the dispatch, the panel resync); the panel just
    // provides the bar. Still called exactly once: the bar is a child of the
    // panel and travels with it, so moving the panel between homes needs no
    // re-attach.
    QMenu *host = m_texturePanel ? m_texturePanel->settingMenu() : nullptr;
    if (!host) {
        return;
    }
    try {
        const std::string json = py::module_::import("python_hooks")
                                     .attr("menus_json")(std::string("child"))
                                     .cast<std::string>();
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json));
        for (const QJsonValue &value : document.array()) {
            const QJsonObject object = value.toObject();
            const QString name = object.value(QStringLiteral("name")).toString();
            if (name.isEmpty()) {
                continue;
            }
            const QString title = object.value(QStringLiteral("title")).toString(name);
            // A SUBMENU of Setting, not a top-level menu: everything that
            // configures this board lives under the one entry.
            QMenu *menu = host->addMenu(title);
            PaintOpenGLWidget *owner = m_childPaintWidget;
            connect(menu, &QMenu::aboutToShow, this, [this, menu, name, owner]() {
                rebuildScriptMenu(menu, name, QStringLiteral("child"), owner);
            });
            rebuildScriptMenu(menu, name, QStringLiteral("child"), owner);
        }
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("child menus error: %1").arg(QString::fromUtf8(error.what())));
    }

    // Which tools stay usable on a protected board is a SCRIPT fact (the
    // guide properties are auto_mapping's), so C++ asks rather than assumes.
    try {
        const std::string json = py::module_::import("python_hooks")
                                     .attr("protected_properties_json")(std::string("child"))
                                     .cast<std::string>();
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json));
        QStringList allowed;
        for (const QJsonValue &value : document.array()) {
            const QString property = value.toString();
            if (!property.isEmpty()) {
                allowed.append(property);
            }
        }
        m_childPaintWidget->setEditablePropertyFilter(allowed);
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("protected properties error: %1")
                          .arg(QString::fromUtf8(error.what())));
    }
#endif
}

void MainWindow::createScriptMenus()
{
#ifdef ANIMEAN_WITH_PYTHON
    // Same shape as the extra-tools and view-button queries: Python owns the
    // menus, C++ renders whatever it is given.
    try {
        // Only the menus that belong on THIS bar. The texture window builds
        // its own from host "child", so a "View" menu can exist on both and
        // mean the board it sits on.
        const std::string json = py::module_::import("python_hooks")
                                     .attr("menus_json")(std::string("main"))
                                     .cast<std::string>();
        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json), &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isArray()) {
            setStatusText(QStringLiteral("menus JSON error: %1").arg(parseError.errorString()));
            return;
        }
        for (const QJsonValue &value : document.array()) {
            const QJsonObject object = value.toObject();
            const QString name = object.value(QStringLiteral("name")).toString();
            if (name.isEmpty()) {
                continue;
            }
            const QString title = object.value(QStringLiteral("title")).toString(name);
            QMenu *menu = menuBar()->addMenu(title);
            PaintOpenGLWidget *owner = m_paintWidget;
            connect(menu, &QMenu::aboutToShow, this, [this, menu, name, owner]() {
                rebuildScriptMenu(menu, name, QStringLiteral("main"), owner);
            });
            rebuildScriptMenu(menu, name, QStringLiteral("main"), owner);
        }
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("menus error: %1").arg(QString::fromUtf8(error.what())));
    }
#endif
}

void MainWindow::populateChildViewButtons()
{
#ifdef ANIMEAN_WITH_PYTHON
    // Same shape as the extra-tools query: Python owns the definitions, C++
    // renders whatever it is given.
    try {
        const std::string json = py::module_::import("python_hooks")
                                     .attr("view_buttons_json")("child")
                                     .cast<std::string>();
        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json), &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isArray()) {
            setStatusText(QStringLiteral("view_buttons JSON error: %1").arg(parseError.errorString()));
            return;
        }
        QVector<TexturePanel::ScriptButtonDefinition> definitions;
        for (const QJsonValue &value : document.array()) {
            const QJsonObject object = value.toObject();
            TexturePanel::ScriptButtonDefinition definition;
            definition.name = object.value(QStringLiteral("name")).toString();
            definition.title = object.value(QStringLiteral("title")).toString();
            definition.tooltip = object.value(QStringLiteral("tooltip")).toString();
            definition.checkable = object.value(QStringLiteral("checkable")).toBool(true);
            if (!definition.name.isEmpty()) {
                definitions.append(definition);
            }
        }
        if (m_texturePanel) {
            m_texturePanel->setScriptButtons(definitions);
        }
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("view_buttons error: %1").arg(QString::fromUtf8(error.what())));
    }
#endif
}

void MainWindow::createTextureFileMenu()
{
    // On the TEXTURE board's own bar. These actions open, save and import the
    // texture document; on the application bar they sat beside the main
    // document's File menu and read as a second, competing File menu.
    QMenuBar *bar = m_texturePanel ? m_texturePanel->menuBar() : menuBar();
    QMenu *textureMenu = new QMenu(QStringLiteral("File"), bar);
    // INSERTED before Setting, not appended: Setting is added in the child
    // window's constructor, so appending would leave the bar reading
    // "Setting | File".
    if (m_texturePanel && m_texturePanel->settingMenu()) {
        bar->insertMenu(m_texturePanel->settingMenu()->menuAction(), textureMenu);
    } else {
        bar->addMenu(textureMenu);
    }

    fillTextureFileMenu(textureMenu);
}

void MainWindow::createMainTextureMenu()
{
    // The texture entries a second time, on the APPLICATION File menu. The
    // panel's own bar travels with the panel - parked, or on a tab the user has
    // clicked away from, it is not reachable at all - and these commands
    // (open, save, import a reference) are ones you reach for from anywhere.
    QMenu *fileMenu = ui->menuFile;
    if (!fileMenu) {
        return;
    }
    // Appended, which lands it directly after the Import submenu that closes
    // the menu today: the two read as a pair of nested entries under the
    // document's own New/Open/Save.
    QMenu *textureMenu = fileMenu->addMenu(QStringLiteral("Texture"));
    fillTextureFileMenu(textureMenu);
}

void MainWindow::fillTextureFileMenu(QMenu *menu)
{
    if (!menu) {
        return;
    }
    // FRESH QActions per menu, deliberately. A QAction added to two menus is
    // one object owned by whichever menu it was created on, and the entry on
    // the other menu would go dead - or worse, dangle - the day that one is
    // rebuilt. What the two menus share is the ROUTES: every lambda below calls
    // exactly the member the texture panel's own bar calls.

    // One Import entry holding the formats, rather than three sibling lines
    // competing with Open/Save for the eye - same shape as the main board's.
    QMenu *importMenu = menu->addMenu(QStringLiteral("Import"));

    QAction *importRasterAction = importMenu->addAction(QStringLiteral("Raster..."));
    connect(importRasterAction, &QAction::triggered, this, [this]() {
        showTextureView();
        importRaster(m_childPaintWidget);
    });

    QAction *importToonzAction = importMenu->addAction(QStringLiteral("OpenToonz Lines..."));
    connect(importToonzAction, &QAction::triggered, this, [this]() {
        showTextureView();
        importOpenToonzLines(m_childPaintWidget);
    });

    QAction *importClipAction = importMenu->addAction(QStringLiteral("Clip Studio Paint..."));
    connect(importClipAction, &QAction::triggered, this, [this]() {
        showTextureView();
        importClipStudioPaint(m_childPaintWidget);
    });

    menu->addSeparator();

    QAction *openAction = menu->addAction(QStringLiteral("Open Texture View..."));
    connect(openAction, &QAction::triggered, this, &MainWindow::openTextureView);

    QAction *saveAction = menu->addAction(QStringLiteral("Save Texture View"));
    connect(saveAction, &QAction::triggered, this, [this]() { saveTextureView(); });

    QAction *saveAsAction = menu->addAction(QStringLiteral("Save Texture View As..."));
    connect(saveAsAction, &QAction::triggered, this, [this]() { saveTextureViewAs(); });

    QAction *exportImageAction = menu->addAction(QStringLiteral("Export Texture View Image..."));
    connect(exportImageAction, &QAction::triggered, this, [this]() { exportTextureImage(); });
}

void MainWindow::showTextureView()
{
    if (!m_texturePanel) {
        return;
    }
    // Surface the home the board ALREADY has rather than imposing one: a user
    // who put the texture view in a sub-control does not want an Import to
    // move it into the central area behind their back. Only when nothing is
    // showing it does the central Texture page get selected.
    if (m_textureFrame && m_textureFrame->isLive()
        && (!m_centralArea || m_centralArea->currentPage() != QStringLiteral("texture"))) {
        m_textureFrame->surface();
    } else if (m_centralArea) {
        m_centralArea->selectPage(QStringLiteral("texture"));
    }
    updateTextureHome();
    setActivePaintView(m_childPaintWidget);
}

void MainWindow::showTextureSubControl()
{
    if (!m_textureFrame) {
        return;
    }
    m_textureFrame->surface();
    updateTextureHome();
    // Only worth activating the board when the sub-control actually got it;
    // with the central Texture page selected the frame shows a placeholder and
    // the board is elsewhere.
    if (m_textureHome == m_textureFrame && m_childPaintWidget) {
        setActivePaintView(m_childPaintWidget);
    }
}

void MainWindow::ensureTextureBoardMapped(TextureMappingRestore *restore)
{
    if (restore) {
        *restore = TextureMappingRestore();
    }
    if (!m_childPaintWidget) {
        return;
    }
    if (m_childPaintWidget->isVisible()) {
        return;
    }
    // Parked or behind another tab: it has to be on screen before
    // grabFramebuffer has anything to return.
    if (m_textureFrame && m_textureFrame->isLive()) {
        // Surfacing the frame shows and raises it; nothing about the workspace
        // the user chose moves, so there is nothing to give back.
        m_textureFrame->surface();
    } else if (m_centralArea && m_centralArea->currentPage() != QStringLiteral("texture")) {
        // Selecting the central page ALSO re-targets the active view (through
        // pageChanged), which a read-only caller never asked for: what it
        // displaced is reported back so the caller can put both halves.
        if (restore) {
            restore->centralPage = m_centralArea->currentPage();
            restore->activeView = activePaintWidget();
        }
        m_centralArea->selectPage(QStringLiteral("texture"));
    }
    updateTextureHome();
    QCoreApplication::processEvents();
}

void MainWindow::restoreTextureBoardMapping(const TextureMappingRestore &restore)
{
    if (restore.centralPage.isEmpty()) {
        return;
    }
    if (m_centralArea) {
        m_centralArea->selectPage(restore.centralPage);
    }
    if (restore.activeView) {
        setActivePaintView(restore.activeView);
    }
    updateTextureHome();
}

void MainWindow::openTextureView()
{
    stopPlayback();
    const QString fileName = QFileDialog::getOpenFileName(
        this,
        QStringLiteral("Open Texture View"),
        QString(),
        textureViewOpenFilter());
    if (fileName.isEmpty()) {
        return;
    }

    QString error;
    if (!m_business->openTextureViewFrom(fileName, &error)) {
        QMessageBox::warning(this,
                             QStringLiteral("Open Texture View"),
                             error.isEmpty() ? QStringLiteral("Unsupported texture file.") : error);
        return;
    }

    m_childFilePath = m_business->childFilePath();
    updateWindowTitle();
    showTextureView();
}

bool MainWindow::saveTextureView()
{
    // In-place save only for a board that already lives in a .textureview
    // file; anything else (no file yet, or a foreign suffix opened through
    // All Files) routes through the dialog so the target is always
    // explicitly confirmed.
    m_childFilePath = m_business->childFilePath();
    if (m_childFilePath.isEmpty()
        || QFileInfo(m_childFilePath).suffix().compare(QStringLiteral("textureview"), Qt::CaseInsensitive) != 0) {
        return saveTextureViewAs();
    }
    QString error;
    if (!m_business->saveTextureViewTo(m_childFilePath, &error)) {
        QMessageBox::warning(this, QStringLiteral("Save Texture View"), error);
        return false;
    }
    return true;
}

bool MainWindow::saveTextureViewAs()
{
    // The suggestion is already migrated to .textureview, so the name the
    // dialog confirms is normally the name that gets written.
    m_childFilePath = m_business->childFilePath();
    const QString selectedFile = m_childFilePath.isEmpty()
                                     ? QDir::home().filePath(QStringLiteral("texture.textureview"))
                                     : ensureTextureViewFileExtension(m_childFilePath);
    const QString fileName = QFileDialog::getSaveFileName(
        this,
        QStringLiteral("Save Texture View As"),
        selectedFile,
        textureViewSaveFilter());
    if (fileName.isEmpty()) {
        return false;
    }
    const QString targetName = ensureTextureViewFileExtension(fileName);
    if (!confirmDivergentOverwrite(fileName, targetName, QStringLiteral("Save Texture View"))) {
        return false;
    }
    QString error;
    if (!m_business->saveTextureViewTo(targetName, &error)) {
        QMessageBox::warning(this, QStringLiteral("Save Texture View"), error);
        return false;
    }
    m_childFilePath = m_business->childFilePath();
    updateWindowTitle();
    return true;
}

void MainWindow::refreshExtraToolOptions()
{
    m_activeExtraTool = m_business->activeExtraTool();
    if (m_activeExtraTool.isEmpty() || !m_toolOptPanel) {
        return;
    }
    m_toolOptPanel->configureLayout(m_business->extraToolOptionsLayout(m_activeExtraTool));
}

bool MainWindow::readJsonFromFile(const QString &fileName,
                                  const QString &dialogTitle,
                                  QJsonObject *object)
{
    QFile file(fileName);
    if (!file.open(QIODevice::ReadOnly)) {
        QMessageBox::warning(this,
                             dialogTitle,
                             QStringLiteral("Failed to read file:\n%1").arg(file.errorString()));
        return false;
    }

    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(file.readAll(), &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        QMessageBox::warning(this,
                             dialogTitle,
                             QStringLiteral("File format error:\n%1").arg(parseError.errorString()));
        return false;
    }

    *object = document.object();
    return true;
}

bool MainWindow::confirmDivergentOverwrite(const QString &requestedName,
                                           const QString &targetName,
                                           const QString &dialogTitle)
{
    // The save dialog's overwrite confirmation covered requestedName. When
    // the owned-extension rewrite moves the write target, an existing file at
    // the new path was never named in any prompt - ask before replacing it.
    if (targetName == requestedName || !QFileInfo::exists(targetName)) {
        return true;
    }
    const QMessageBox::StandardButton answer = QMessageBox::question(
        this,
        dialogTitle,
        QStringLiteral("%1 already exists.\nDo you want to replace it?")
            .arg(QFileInfo(targetName).fileName()),
        QMessageBox::Yes | QMessageBox::No,
        QMessageBox::No);
    return answer == QMessageBox::Yes;
}

void MainWindow::installLoadedModel(PaintOpenGLWidget *view, const AnimeSceneModel &model)
{
    if (!view) {
        return;
    }
    m_business->installLoadedModel(view->viewName(), model);
}

void MainWindow::activateLoadedModel(PaintOpenGLWidget *view, const QString &historyLabel)
{
    if (!view) {
        return;
    }
    m_business->activateLoadedModel(view->viewName(), historyLabel);
}

void MainWindow::adoptLoadedModel(PaintOpenGLWidget *view,
                                  const AnimeSceneModel &model,
                                  const QString &historyLabel)
{
    if (!view) {
        return;
    }
    m_business->adoptLoadedModel(view->viewName(), model, historyLabel);
}

bool MainWindow::writeJsonToFile(const QJsonObject &object,
                                 const QString &fileName,
                                 const QString &dialogTitle)
{
    QSaveFile file(fileName);
    if (!file.open(QIODevice::WriteOnly)) {
        QMessageBox::warning(this,
                             dialogTitle,
                             QStringLiteral("Failed to write file:\n%1").arg(file.errorString()));
        return false;
    }

    const QJsonDocument document(object);
    file.write(document.toJson(QJsonDocument::Indented));
    if (!file.commit()) {
        QMessageBox::warning(this,
                             dialogTitle,
                             QStringLiteral("Failed to save file:\n%1").arg(file.errorString()));
        return false;
    }

    return true;
}

bool MainWindow::exportTextureImage()
{
    if (!m_childPaintWidget || !m_texturePanel) {
        return false;
    }

    // Make the texture view renderable for the framebuffer grab WITHOUT
    // changing the active editing view: exporting is read-only, and a
    // cancelled export must leave the active view untouched. Already-visible
    // is the common case and costs nothing. The active-view border is UI
    // chrome — hide it during the grab so it is not baked into the exported
    // image.
    TextureMappingRestore mapping;
    ensureTextureBoardMapped(&mapping);
    m_childPaintWidget->setActiveIndicator(false);
    // The Background choice is a VIEWING aid, so it is suppressed for the
    // grab the same way the active-view border is. A black board would tint
    // the export, and the transparency chequer would bake a grey checkerboard
    // into the PNG as if it were artwork - the chequer means "nothing here",
    // and paint is the wrong way to say that. (Writing real alpha instead is
    // a separate job: grabFramebuffer returns what was composited.)
    const PaintOpenGLWidget::BackgroundMode savedBackground = m_childPaintWidget->backgroundMode();
    m_childPaintWidget->setBackgroundMode(PaintOpenGLWidget::BackgroundMode::White);
    QCoreApplication::processEvents();
    const QImage image = m_childPaintWidget->grabFramebuffer();
    m_childPaintWidget->setBackgroundMode(savedBackground);
    // Before every return below, indicator included: the workspace goes back
    // whether the export succeeded, failed or was cancelled at the dialog.
    restoreTextureBoardMapping(mapping);
    m_childPaintWidget->setActiveIndicator(activePaintWidget() == m_childPaintWidget);
    if (image.isNull()) {
        QMessageBox::warning(this,
                             QStringLiteral("Export Texture View Image"),
                             QStringLiteral("The texture view could not be captured. Make sure it is visible, then try again."));
        return false;
    }

    QString fileName = QFileDialog::getSaveFileName(
        this,
        QStringLiteral("Export Texture View Image"),
        QDir::home().filePath(QStringLiteral("texture.png")),
        QStringLiteral("PNG Image (*.png);;All Files (*)"));
    if (fileName.isEmpty()) {
        return false;
    }
    if (QFileInfo(fileName).suffix().isEmpty()) {
        fileName += QStringLiteral(".png");
    }

    if (!image.save(fileName, "PNG")) {
        QMessageBox::warning(this,
                             QStringLiteral("Export Texture View Image"),
                             QStringLiteral("Failed to write the image to:\n%1").arg(fileName));
        return false;
    }

    setStatusText(QStringLiteral("Exported texture image: %1 (%2 x %3)")
                      .arg(QFileInfo(fileName).fileName())
                      .arg(image.width())
                      .arg(image.height()));
    return true;
}

PaintOpenGLWidget *MainWindow::activePaintWidget() const
{
    if (m_business && m_business->activeViewName() == QStringLiteral("child") && m_childPaintWidget) {
        return m_childPaintWidget;
    }
    return m_activePaintWidget ? m_activePaintWidget : m_paintWidget;
}

PaintOpenGLWidget *MainWindow::framePanelTarget() const
{
    if (m_business) {
        return m_business->framePanelTargetViewName() == QStringLiteral("child")
                   ? m_childPaintWidget
                   : m_paintWidget;
    }
    PaintOpenGLWidget *view = activePaintWidget();
    if (view == m_childPaintWidget && m_texturePanel && !m_texturePanel->changableTimeline()) {
        return m_paintWidget;
    }
    return view;
}

// Retired for the Layers window: its two pages are bound to a board each and
// no longer follow focus. It survives as the ASSET panel's redirect, which
// keeps today's behaviour - one asset list, following the board whose texture
// is editable.
PaintOpenGLWidget *MainWindow::layerPanelTarget() const
{
    if (m_business) {
        return m_business->layerPanelTargetViewName() == QStringLiteral("child")
                   ? m_childPaintWidget
                   : m_paintWidget;
    }
    PaintOpenGLWidget *view = activePaintWidget();
    if (view == m_childPaintWidget && m_texturePanel && !m_texturePanel->changableTexture()) {
        return m_paintWidget;
    }
    return view;
}

PaintOpenGLWidget *MainWindow::assetPanelTarget() const
{
    return layerPanelTarget();
}

ParentWindow *MainWindow::parentWindowNamed(const QString &name) const
{
    for (ParentWindow *window : m_parentWindows) {
        if (window && window->name() == name) {
            return window;
        }
    }
    return nullptr;
}

SelectionAttention &MainWindow::attentionFor(PaintOpenGLWidget *view)
{
    if (m_business && view) {
        return m_business->attentionForView(view->viewName());
    }
    return m_attentionByView[view];
}

void MainWindow::setActivePaintView(PaintOpenGLWidget *view)
{
    if (!view || (m_activePaintWidget == view && m_business->activeViewName() == view->viewName())) {
        return;
    }

    m_activePaintWidget = view;
    m_hasPendingAttention = false;
    // Keep keyboard focus in lockstep with the active view: otherwise clicking
    // the still-focused other canvas produces no focusInEvent, the active view
    // never follows, and panel/tool operations land in the wrong scene.
    view->setFocus(Qt::OtherFocusReason);
    for (PaintOpenGLWidget *paintView : m_paintViews) {
        paintView->setActiveIndicator(paintView == view);
    }
    m_business->setActiveViewName(view->viewName());
    refreshPanelTargets();
    scheduleHistoryRefresh();
    syncEmbeddedPythonState();
    // The rail is enforced against the board the next gesture lands on, and
    // that board just changed.
    refreshToolLockState();
    if (m_forcePadDock) {
        // The pad acts on the active view; say so where the user is looking.
        m_forcePadDock->setWindowTitle(QStringLiteral("Repulsion Pad - %1").arg(view->viewName()));
    }
}

void MainWindow::refreshPanelTargets()
{
    // The timeline may now be pointed at a different board, so the thumbnails
    // it is holding are of the wrong document.
    if (m_timeline) {
        m_timeline->clearThumbnails();
    }
    refreshTimeline();
    refreshLayerLists();
    refreshAssetList(attentionFor(assetPanelTarget()).asset);
}

void MainWindow::setupListDragDrop()
{
    for (LayerPanel *panel : {m_mainLayerPanel, m_childLayerPanel}) {
        panel->layerList()->setDragDropMode(QAbstractItemView::DragDrop);
        panel->layerList()->setDefaultDropAction(Qt::MoveAction);
        panel->layerList()->setDragDropOverwriteMode(false);
        panel->layerList()->setDragEnabled(true);
        panel->layerList()->setSelectionMode(QAbstractItemView::SingleSelection);
        panel->layerList()->viewport()->setAcceptDrops(true);
        panel->layerList()->viewport()->installEventFilter(this);
    }

    m_assetPanel->assetList()->setDragDropMode(QAbstractItemView::DragOnly);
    m_assetPanel->assetList()->setSelectionMode(QAbstractItemView::SingleSelection);
    m_assetPanel->assetList()->viewport()->installEventFilter(this);
}

void MainWindow::setupPythonDebugDock()
{
    m_pythonDebugDock = new ParentWindow(QStringLiteral("python_debug"),
                                         QStringLiteral("Python Debug"), this);

    QWidget *panel = new QWidget(m_pythonDebugDock);
    QVBoxLayout *layout = new QVBoxLayout(panel);
    layout->setContentsMargins(8, 8, 8, 8);
    layout->setSpacing(6);

    m_pythonDebugOutput = new QPlainTextEdit(panel);
    m_pythonDebugOutput->setObjectName(QStringLiteral("PythonDebugOutput"));
    m_pythonDebugOutput->setPlaceholderText(QStringLiteral("Python debug output"));
    m_pythonDebugOutput->setLineWrapMode(QPlainTextEdit::WidgetWidth);
    // High-frequency hooks (pad drags, per-move events) must not grow the
    // document without bound across a session.
    m_pythonDebugOutput->setMaximumBlockCount(2000);

    QHBoxLayout *commandLayout = new QHBoxLayout;
    QLabel *commandLabel = new QLabel(QStringLiteral("Command"), panel);
    m_pythonDebugCommand = new QLineEdit(panel);
    m_pythonDebugCommand->setObjectName(QStringLiteral("PythonDebugCommand"));
    m_pythonDebugCommand->setText(QStringLiteral("bind_test.py"));
    QPushButton *runButton = new QPushButton(QStringLiteral("Run"), panel);

    commandLayout->addWidget(commandLabel);
    commandLayout->addWidget(m_pythonDebugCommand, 1);
    commandLayout->addWidget(runButton);
    layout->addWidget(m_pythonDebugOutput, 1);
    layout->addLayout(commandLayout);

    m_pythonDebugDock->addPage(QStringLiteral("python_debug"), QStringLiteral("Python Debug"), panel);
    addDockWidget(Qt::BottomDockWidgetArea, m_pythonDebugDock);
    if (m_timeline && dockWidgetArea(m_timeline) == Qt::BottomDockWidgetArea) {
        // BELOW the timeline, not beside it: the bottom band is where the
        // timeline earns its full window width, and a second dock sharing the
        // row would cut the frame strip in half the moment the REPL is shown.
        splitDockWidget(m_timeline, m_pythonDebugDock, Qt::Vertical);
    }
    // Hidden by default: a REPL against the running app is a developer
    // surface, not part of drawing. The View menu toggle brings it up.
    m_pythonDebugDock->hide();

    connect(runButton, &QPushButton::clicked, this, [this]() {
        runPythonDebugCommand(m_pythonDebugCommand->text());
    });
    connect(m_pythonDebugCommand, &QLineEdit::returnPressed, this, [this]() {
        runPythonDebugCommand(m_pythonDebugCommand->text());
    });
}

void MainWindow::runPythonDebugCommand(const QString &command)
{
    if (!m_pythonDebugOutput) {
        return;
    }

    const QString trimmed = command.trimmed();
    if (trimmed.isEmpty()) {
        return;
    }

    m_pythonDebugOutput->appendPlainText(QStringLiteral("> %1").arg(trimmed));
    m_pythonDebugOutput->appendPlainText(runEmbeddedPythonCommand(trimmed).trimmed());
    m_pythonDebugOutput->appendPlainText(QString());
    m_pythonDebugOutput->verticalScrollBar()->setValue(m_pythonDebugOutput->verticalScrollBar()->maximum());
}

void MainWindow::appendPythonDebugMessage(const QString &message)
{
    if (!m_pythonDebugOutput || message.trimmed().isEmpty()) {
        return;
    }

    m_pythonDebugOutput->appendPlainText(message.trimmed());
    m_pythonDebugOutput->appendPlainText(QString());
    m_pythonDebugOutput->verticalScrollBar()->setValue(m_pythonDebugOutput->verticalScrollBar()->maximum());
}

void MainWindow::runPythonInitializationScript()
{
#ifdef ANIMEAN_WITH_PYTHON
    appendPythonDebugMessage(QStringLiteral("> initalize.py"));
    appendPythonDebugMessage(runEmbeddedPythonCommand(QStringLiteral("initalize.py")).trimmed());
#endif
}

QString MainWindow::resolvePythonScriptPath(const QString &scriptName) const
{
    const QFileInfo directInfo(scriptName);
    if (directInfo.exists()) {
        return directInfo.absoluteFilePath();
    }

    const QString appPath = QCoreApplication::applicationDirPath();
    const QStringList candidates = {
        QDir(appPath).filePath(scriptName),
#ifdef ANIMEAN_WITH_PYTHON
        QDir(QStringLiteral(ANIMEAN_PYFILE_DIR)).filePath(scriptName),
        QDir(QStringLiteral(ANIMEAN_SOURCE_DIR)).filePath(scriptName),
#endif
    };

    for (const QString &candidate : candidates) {
        if (QFileInfo::exists(candidate)) {
            return QFileInfo(candidate).absoluteFilePath();
        }
    }

    return QString();
}

QString MainWindow::runEmbeddedPythonCommand(const QString &command)
{
#ifdef ANIMEAN_WITH_PYTHON
    try {
        py::gil_scoped_acquire acquire;
        py::dict globals = py::module_::import("__main__").attr("__dict__");
        syncEmbeddedPythonState();

        const QString runPrefix = QStringLiteral("run ");
        QString scriptName;
        if (command.endsWith(QStringLiteral(".py"), Qt::CaseInsensitive)) {
            scriptName = command;
        } else if (command.startsWith(runPrefix, Qt::CaseInsensitive)) {
            scriptName = command.mid(runPrefix.size()).trimmed();
        }

        const bool runScript = !scriptName.isEmpty();
        const QString scriptPath = runScript ? resolvePythonScriptPath(scriptName) : QString();
        if (runScript && scriptPath.isEmpty()) {
            return QStringLiteral("Python script not found: %1").arg(scriptName);
        }

        py::object io = py::module_::import("io");
        py::object contextlib = py::module_::import("contextlib");
        py::object stdoutBuffer = io.attr("StringIO")();
        py::object stderrBuffer = io.attr("StringIO")();
        py::object stdoutRedirect = contextlib.attr("redirect_stdout")(stdoutBuffer);
        py::object stderrRedirect = contextlib.attr("redirect_stderr")(stderrBuffer);

        QString errorText;
        stdoutRedirect.attr("__enter__")();
        stderrRedirect.attr("__enter__")();
        try {
            if (runScript) {
                globals["__file__"] = scriptPath.toStdString();
                const QString normalizedPath = QDir::toNativeSeparators(scriptPath);
                const QString scriptLiteral = QString::fromStdString(
                    py::repr(py::str(normalizedPath.toStdString())).cast<std::string>());
                const QString code = QStringLiteral(
                    "with open(%1, 'r', encoding='utf-8') as __animean_file:\n"
                    "    __animean_code = __animean_file.read()\n"
                    "exec(compile(__animean_code, %1, 'exec'), globals())\n")
                                         .arg(scriptLiteral);
                py::exec(code.toStdString(), globals);
            } else {
                const char *runner =
                    "import ast\n"
                    "try:\n"
                    "    __animean_expr = ast.parse(__animean_command, mode='eval')\n"
                    "except SyntaxError:\n"
                    "    exec(__animean_command, globals())\n"
                    "else:\n"
                    "    __animean_value = eval(compile(__animean_expr, '<AnimeAn debug>', 'eval'), globals())\n"
                    "    if __animean_value is not None:\n"
                    "        print(repr(__animean_value))\n";
                globals["__animean_command"] = command.toStdString();
                py::exec(runner, globals);
            }
        } catch (const py::error_already_set &error) {
            errorText = QString::fromUtf8(error.what());
        }
        stderrRedirect.attr("__exit__")(py::none(), py::none(), py::none());
        stdoutRedirect.attr("__exit__")(py::none(), py::none(), py::none());

        QString output = QString::fromUtf8(stdoutBuffer.attr("getvalue")().cast<std::string>().c_str());
        const QString stderrOutput = QString::fromUtf8(stderrBuffer.attr("getvalue")().cast<std::string>().c_str());
        if (!stderrOutput.isEmpty()) {
            output += stderrOutput;
        }
        if (!errorText.isEmpty()) {
            output += errorText;
        }
        if (output.trimmed().isEmpty()) {
            output = QStringLiteral("(no output)");
        }
        PaintOpenGLWidget *view = activePaintWidget();
        updateAttention(view,
                        AttentionChange::AssetChange,
                        view->model().currentFrame(),
                        view->model().currentLayer(),
                        view->model().currentAsset());
        for (PaintOpenGLWidget *paintView : m_paintViews) {
            paintView->update();
        }
        return output;
    } catch (const py::error_already_set &error) {
        return QStringLiteral("Python debug error: %1").arg(QString::fromUtf8(error.what()));
    }
#else
    Q_UNUSED(command);
    return QStringLiteral("Python disabled");
#endif
}

void MainWindow::syncEmbeddedPythonState()
{
#ifdef ANIMEAN_WITH_PYTHON
    try {
        py::gil_scoped_acquire acquire;
        py::dict globals = py::module_::import("__main__").attr("__dict__");
        py::object animeanPython = py::module_::import("animean_python");
        py::object animeModel = py::module_::import("animemodel");
        PaintOpenGLWidget *view = activePaintWidget();
        globals["animean_python"] = animeanPython;
        globals["animemodel"] = animeModel;
        globals["ui"] = animeModel.attr("ui");
        globals["model"] = py::cast(&view->model(), py::return_value_policy::reference);
        globals["main_model"] = py::cast(&m_paintWidget->model(), py::return_value_policy::reference);
        globals["child_model"] = py::cast(&m_childPaintWidget->model(), py::return_value_policy::reference);
        globals["active_view"] = view->viewName().toStdString();
        globals["current"] = animeModel.attr("current");
        globals["model_pybind"] = animeanPython.attr("model_pybind");
        globals["vectorlogic"] = animeanPython.attr("vectorlogic");
        globals["canvas_width"] = view->model().canvasSize().width();
        globals["canvas_height"] = view->model().canvasSize().height();
        globals["main_canvas_width"] = m_paintWidget->model().canvasSize().width();
        globals["main_canvas_height"] = m_paintWidget->model().canvasSize().height();
        globals["child_canvas_width"] = m_childPaintWidget->model().canvasSize().width();
        globals["child_canvas_height"] = m_childPaintWidget->model().canvasSize().height();
    } catch (const py::error_already_set &error) {
        appendPythonDebugMessage(QStringLiteral("[python register] error: %1").arg(QString::fromUtf8(error.what())));
        setStatusText(QStringLiteral("Python state sync error: %1").arg(QString::fromUtf8(error.what())));
    }
#endif
}

void MainWindow::setupConnections()
{
    connect(ui->actionNew, &QAction::triggered, this, &MainWindow::newProject);
    connect(ui->actionOpen, &QAction::triggered, this, &MainWindow::openProject);
    connect(ui->actionSave, &QAction::triggered, this, &MainWindow::saveProject);
    connect(ui->actionSaveAs, &QAction::triggered, this, &MainWindow::saveProjectAs);

    connect(m_business, &AnimeanBusiness::statusMessageChanged, this, [this](const QString &text) {
        statusBar()->showMessage(text);
    });
    connect(m_business, &AnimeanBusiness::windowTitleChanged, this, &QWidget::setWindowTitle);
    connect(m_business, &AnimeanBusiness::timelineChanged, this, &MainWindow::refreshTimeline);
    connect(m_business, &AnimeanBusiness::requestClearTimelineThumbnails, this, [this]() {
        if (m_timeline) {
            m_timeline->clearThumbnails();
        }
    });
    connect(m_business, &AnimeanBusiness::layersChanged, this, [this](const QString &viewName, int) {
        PaintOpenGLWidget *view = viewName == QStringLiteral("child")
                                      ? m_childPaintWidget
                                      : m_paintWidget;
        if (view) {
            refreshLayerList(layerPanelForView(view), view, attentionFor(view).layer);
        }
    });
    connect(m_business, &AnimeanBusiness::assetsChanged, this, [this](const QString &, int) {
        refreshAssetList(attentionFor(assetPanelTarget()).asset);
    });
    connect(m_business, &AnimeanBusiness::historyChanged,
            this, &MainWindow::scheduleHistoryRefresh);
    connect(m_business, &AnimeanBusiness::pythonStateSyncRequested,
            this, &MainWindow::syncEmbeddedPythonState);
    connect(m_business, &AnimeanBusiness::requestSurfaceTextureView,
            this, &MainWindow::showTextureView);
    connect(m_business, &AnimeanBusiness::activeViewChanged, this, [this](const QString &viewName) {
        PaintOpenGLWidget *view = viewName == QStringLiteral("child")
                                      ? m_childPaintWidget
                                      : m_paintWidget;
        if (view && m_activePaintWidget != view) {
            setActivePaintView(view);
        }
    });
    connect(m_business, &AnimeanBusiness::requestAutoFitTextureControlView,
            this, &MainWindow::autoFitTextureControlView);
    connect(m_business, &AnimeanBusiness::playbackStateChanged, this, [this](bool playing, int, const QString &) {
        if (m_timeline) {
            m_timeline->setPlaybackActive(playing);
        }
    });
    connect(m_business, &AnimeanBusiness::toolOptionsLayoutChanged, this,
            [this](const QJsonObject &layout, int, bool) {
        if (m_toolOptPanel) {
            m_toolOptPanel->configureLayout(layout);
        }
    });

    for (PaintOpenGLWidget *view : m_paintViews) {
        connect(view, &PaintOpenGLWidget::focusGained, this, [this, view]() {
            setActivePaintView(view);
        });

        connect(view, &PaintOpenGLWidget::layerListChanged, this, [this, view](int selectedLayer) {
            updateAttention(view,
                            AttentionChange::LayerChange,
                            view->model().currentFrame(),
                            selectedLayer,
                            view->model().currentAsset());
        });

        connect(view, &PaintOpenGLWidget::assetListChanged, this, [this, view](int selectedAsset) {
            updateAttention(view,
                            AttentionChange::AssetChange,
                            attentionFor(view).frame,
                            attentionFor(view).layer,
                            selectedAsset);
        });

        connect(view, &PaintOpenGLWidget::pythonDebugMessage,
                this, &MainWindow::appendPythonDebugMessage);

        connect(view, &PaintOpenGLWidget::playbackInterrupted,
                this, &MainWindow::stopPlayback);
    }

    connect(m_texturePanel, &TexturePanel::changableTimelineToggled, this, [this](bool on) {
        m_business->setChangeableTimeline(on);
        refreshPanelTargets();
    });
    connect(m_texturePanel, &TexturePanel::changableTextureToggled, this, [this](bool on) {
        m_business->setChangeableTexture(on);
        refreshPanelTargets();
    });

    connectLayerPanel(m_mainLayerPanel, m_paintWidget);
    connectLayerPanel(m_childLayerPanel, m_childPaintWidget);

    connect(m_assetPanel->addButton(), &QPushButton::clicked, this, [this]() {
        m_business->addAsset();
    });

    connect(m_assetPanel->unselectButton(), &QPushButton::clicked, this, [this]() {
        m_business->unselectAsset();
    });

    connect(m_assetPanel->assetList(), &QListWidget::currentRowChanged, this, [this](int row) {
        if (!m_refreshingLists) {
            PaintOpenGLWidget *view = assetPanelTarget();
            requestAttentionUpdate(view, AttentionChange::AssetChange,
                                   attentionFor(view).frame, attentionFor(view).layer, row);
        }
    });

    connect(ui->actionimport_Raster, &QAction::triggered, this, [this]() {
        showMainPaintView();
        importRaster(m_paintWidget);
    });
    connect(ui->actionImport_OpenToonz_Lines, &QAction::triggered, this, [this]() {
        showMainPaintView();
        importOpenToonzLines(m_paintWidget);
    });
    connect(ui->actionImport_Clip_Studio_Paint, &QAction::triggered, this, [this]() {
        showMainPaintView();
        importClipStudioPaint(m_paintWidget);
    });
}

// Every layers page is wired here against the ONE board it shows, so nothing
// in the layer path has to ask which view is active any more.
void MainWindow::connectLayerPanel(LayerPanel *panel, PaintOpenGLWidget *view)
{
    connect(panel->layerList(), &QTreeWidget::currentItemChanged, this,
            [this, view](QTreeWidgetItem *item, QTreeWidgetItem *) {
        if (m_refreshingLists || !item) {
            return;
        }
        int layerIndex = -1;
        if (item->data(0, kGroupIdRole).toInt() != 0) {
            // A group row carries no layer of its own; treat selecting it as
            // selecting its first member layer, so a unit-of-work group (an
            // auto-mapping layer) behaves like one focusable item. Reading it
            // as "layer 0" is still wrong - resolve through the children.
            std::function<int(QTreeWidgetItem *)> firstLayer =
                [&](QTreeWidgetItem *node) {
                for (int i = 0; i < node->childCount(); ++i) {
                    QTreeWidgetItem *child = node->child(i);
                    if (child->data(0, kGroupIdRole).toInt() > 0) {
                        const int inner = firstLayer(child);
                        if (inner >= 0) {
                            return inner;
                        }
                    } else {
                        const int index = child->data(0, Qt::UserRole).toInt();
                        if (index >= 0) {
                            return index;
                        }
                    }
                }
                return -1;
            };
            layerIndex = firstLayer(item);
        } else {
            layerIndex = item->data(0, Qt::UserRole).toInt();
        }
        if (layerIndex < 0) {
            return;
        }
        requestAttentionUpdate(view, AttentionChange::LayerChange,
                               attentionFor(view).frame, layerIndex, attentionFor(view).asset);
    });

    // Collapsing a group is a document edit, not a view whim: it is what the
    // H/V group's "collapsed by default" means, so it has to survive a
    // refresh, a save and a history restore.
    auto rememberExpansion = [this, view](QTreeWidgetItem *item, bool collapsed) {
        if (m_refreshingLists || !item) {
            return;
        }
        const int groupId = item->data(0, kGroupIdRole).toInt();
        if (groupId > 0) {
            m_business->setLayerGroupCollapsed(groupId, collapsed, view->viewName());
        }
    };
    connect(panel->layerList(), &QTreeWidget::itemExpanded, this,
            [rememberExpansion](QTreeWidgetItem *item) { rememberExpansion(item, false); });
    connect(panel->layerList(), &QTreeWidget::itemCollapsed, this,
            [rememberExpansion](QTreeWidgetItem *item) { rememberExpansion(item, true); });

    connect(panel->layerList(), &QTreeWidget::itemChanged, this,
            [this, view](QTreeWidgetItem *item, int) {
        if (m_refreshingLists || !item || item->data(0, kGroupIdRole).toInt() != 0) {
            return;
        }
        const int layerIndex = item->data(0, Qt::UserRole).toInt();
        if (layerIndex < 0) {
            return;
        }
        const bool visible = item->checkState(0) == Qt::Checked;
        // Deferred so the Python hook (which may rebuild this very list) never
        // runs inside the itemChanged emission.
        QMetaObject::invokeMethod(this, [this, view, layerIndex, visible]() {
            m_business->setLayerVisible(layerIndex, visible, view->viewName());
        }, Qt::QueuedConnection);
    });

    connect(panel->layerList(), &QTreeWidget::customContextMenuRequested, this,
            [this, panel, view](const QPoint &pos) { showLayerContextMenu(panel, view, pos); });

    connect(panel->addButton(), &QPushButton::clicked, this, [this, view]() {
        m_business->addLayer(view->viewName());
    });

    connect(panel->deleteButton(), &QPushButton::clicked, this, [this, panel, view]() {
        QTreeWidgetItem *item = panel->layerList()->currentItem();
        if (item && item->data(0, kGroupIdRole).toInt() > 0) {
            // Remove Layer on a group removes the group AND its layers - that
            // is what "delete" means for the thing the user is pointing at.
            // Dropping only the grouping lives on the right-click menu as
            // "Ungroup", so the non-destructive option is still one click away.
            const int groupId = item->data(0, kGroupIdRole).toInt();
            m_business->deleteLayerGroup(groupId, view->viewName());
            return;
        }
        const int layerIndex = item ? item->data(0, Qt::UserRole).toInt() : -1;
        m_business->deleteLayer(layerIndex, view->viewName());
    });

    connect(panel->unselectButton(), &QPushButton::clicked, this, [this, view]() {
        m_business->unselectLayer(view->viewName());
    });

    // NOT rowsMoved. QListModel overrides moveRows, so the old flat list really
    // did emit it; QTreeModel does not, and QTreeWidget::dropEvent implements
    // an internal move itself as takeItem + insertItem - which emits
    // rowsRemoved then rowsInserted and NEVER rowsMoved. Listening for the
    // signal Qt does not send left the panel reshaping itself on a drop while
    // the model was never told, so the row snapped back on the next refresh
    // and layer reordering by drag silently stopped working.
    connect(panel->layerList()->model(), &QAbstractItemModel::rowsInserted,
            this, [this, panel, view](const QModelIndex &parent, int first, int last) {
        if (m_refreshingLists || m_layerDropPanel != panel || first != last) {
            return;
        }
        QTreeWidget *tree = panel->layerList();
        QTreeWidgetItem *parentItem = parent.isValid() ? tree->itemFromIndex(parent) : nullptr;
        const int count = parentItem ? parentItem->childCount() : tree->topLevelItemCount();
        if (first < 0 || first >= count) {
            return;
        }
        QTreeWidgetItem *movedItem = parentItem ? parentItem->child(first)
                                                : tree->topLevelItem(first);
        m_layerDropPanel = nullptr;
        // Qt has already reshaped the widget; the model has to be told what
        // the new shape means. Deferred so the model edit never runs inside
        // the view's own drop handling - and re-found by column id there,
        // because a refresh in between would delete this pointer.
        const int movedColumnId = movedItem && movedItem->data(0, kGroupIdRole).toInt() == 0
                                      ? view->model().layerIdAt(
                                            movedItem->data(0, Qt::UserRole).toInt())
                                      : 0;
        QMetaObject::invokeMethod(this, [this, panel, view, movedColumnId]() {
            applyLayerPanelStructure(panel, view, movedColumnId);
        }, Qt::QueuedConnection);
    });
}

LayerPanel *MainWindow::layerPanelForView(PaintOpenGLWidget *view) const
{
    return view == m_childPaintWidget ? m_childLayerPanel : m_mainLayerPanel;
}

PaintOpenGLWidget *MainWindow::viewForLayerPanel(LayerPanel *panel) const
{
    return panel == m_childLayerPanel ? m_childPaintWidget : m_paintWidget;
}

bool MainWindow::eventFilter(QObject *watched, QEvent *event)
{
    if (m_childPaintWidget && watched == m_childPaintWidget) {
        // FIRST, and with its own return: this filter is installed in
        // createTexturePanel, before the list panels below it exist, and a
        // resize can arrive in between.
        if (event->type() == QEvent::Resize && !m_updatingTextureHome) {
            // Re-cover the new viewport. Skipped mid-reparent: the move's own
            // resizes are measured against a size the layout has not settled
            // yet, and the queued restoreTextureViewSlot re-fits with the
            // final one anyway. No debounce - the fit is one bounds scan and
            // one transform, and it cannot feed itself: the scroll bars'
            // visibility follows the canvas mode, never the transform, so
            // nothing here changes the board's size.
            autoFitTextureControlView();
        }
        return QMainWindow::eventFilter(watched, event);
    }

    LayerPanel *layerPanel = nullptr;
    for (LayerPanel *candidate : {m_mainLayerPanel, m_childLayerPanel}) {
        if (candidate && watched == candidate->layerList()->viewport()) {
            layerPanel = candidate;
            break;
        }
    }
    const bool watchedListViewport = layerPanel
                                     || watched == m_assetPanel->assetList()->viewport();
    if (watchedListViewport) {
        if (event->type() == QEvent::MouseButtonPress) {
            QMouseEvent *mouseEvent = static_cast<QMouseEvent *>(event);
            if (mouseEvent->button() == Qt::LeftButton) {
                m_listMousePressed = true;
                m_listDragActive = false;
                m_hasPendingAttention = false;
                m_listPressPos = mouseEvent->pos();
            }
        } else if (event->type() == QEvent::MouseMove && m_listMousePressed) {
            QMouseEvent *mouseEvent = static_cast<QMouseEvent *>(event);
            if ((mouseEvent->pos() - m_listPressPos).manhattanLength() >= QApplication::startDragDistance()) {
                m_listDragActive = true;
            }
        } else if (event->type() == QEvent::MouseButtonRelease) {
            QMouseEvent *mouseEvent = static_cast<QMouseEvent *>(event);
            if (mouseEvent->button() == Qt::LeftButton && m_listMousePressed) {
                const bool shouldCommit = m_hasPendingAttention && !m_listDragActive && m_pendingAttentionView;
                const AttentionChange change = m_pendingAttentionChange;
                const SelectionAttention attention = m_pendingAttention;
                PaintOpenGLWidget *view = m_pendingAttentionView;
                m_listMousePressed = false;
                m_listDragActive = false;
                m_hasPendingAttention = false;
                if (shouldCommit) {
                    updateAttention(view, change, attention.frame, attention.layer, attention.asset);
                }
            }
        }
    }

    if (layerPanel &&
        (event->type() == QEvent::DragEnter || event->type() == QEvent::DragMove || event->type() == QEvent::Drop)) {
        QDropEvent *dropEvent = static_cast<QDropEvent *>(event);
        PaintOpenGLWidget *view = viewForLayerPanel(layerPanel);
        m_listDragActive = true;
        if (dropEvent->source() == layerPanel->layerList()) {
            // Arms the rowsInserted handler: QTreeWidget reorders itself with
            // takeItem + insertItem, and an insert only means "a drop landed"
            // while one is actually in flight - and only on the page that took
            // it.
            if (event->type() == QEvent::Drop) {
                m_layerDropPanel = layerPanel;
            }
            return QMainWindow::eventFilter(watched, event);
        }

        // An asset index only means something inside the scene the Assets
        // panel is currently listing, so a drag into the OTHER board's page is
        // refused rather than resolved against the wrong document.
        if (dropEvent->source() != m_assetPanel->assetList() || view != assetPanelTarget()) {
            if (event->type() == QEvent::Drop) {
                m_hasPendingAttention = false;
                m_listMousePressed = false;
                m_listDragActive = false;
            }
            dropEvent->ignore();
            return true;
        }

        const int assetIndex = m_assetPanel->assetList()->currentRow();
        if (assetIndex < 0) {
            if (event->type() == QEvent::Drop) {
                m_hasPendingAttention = false;
                m_listMousePressed = false;
                m_listDragActive = false;
            }
            dropEvent->ignore();
            return true;
        }

        dropEvent->acceptProposedAction();
        if (event->type() == QEvent::Drop) {
            m_hasPendingAttention = false;
            m_business->addLayerForAsset(assetIndex, view->viewName());
            m_listMousePressed = false;
            m_listDragActive = false;
        }
        return true;
    }

    return QMainWindow::eventFilter(watched, event);
}

void MainWindow::createToolDocks()
{
    // Two instances, one per page. Only the painting page carries the enum
    // tools; the mapping one is a list of script buttons, so a script tool
    // sits beside its own family instead of at the end of one long column.
    m_paintingToolsPanel = new ToolsPanel(this, true);
    m_mappingToolsPanel = new ToolsPanel(this, false);
    m_toolsPanels = {m_paintingToolsPanel, m_mappingToolsPanel};
    // The docked options panel is a sub-control HOST; the script-settings
    // dialog builds its own ToolOptPanel and must not be one (a frame dropped
    // into a modal window would go away with it).
    ToolOptPanel *toolOptPanel = new ToolOptPanel(this, true);

    m_toolsDock = new ParentWindow(QStringLiteral("tools"), QStringLiteral("Tools"), this);
    m_toolsDock->addPage(QStringLiteral("painting"), QStringLiteral("Painting"), m_paintingToolsPanel);
    m_toolsDock->addPage(QStringLiteral("mapping"), QStringLiteral("Mapping"), m_mappingToolsPanel);
    addDockWidget(Qt::LeftDockWidgetArea, m_toolsDock);

    m_toolOptDock = new ParentWindow(QStringLiteral("tool_options"),
                                     QStringLiteral("Tool Options"), this);
    m_toolOptDock->addPage(QStringLiteral("options"), QStringLiteral("Options"), toolOptPanel);
    addDockWidget(Qt::RightDockWidgetArea, m_toolOptDock);
    splitDockWidget(m_toolOptDock, m_layerDock, Qt::Vertical);
    splitDockWidget(m_layerDock, m_assetDock, Qt::Vertical);

    {
        const QHash<QString, ToolsPanel *> panelForPage = {
            {QStringLiteral("painting"), m_paintingToolsPanel},
            {QStringLiteral("mapping"), m_mappingToolsPanel},
        };
        QHash<ToolsPanel *, QVector<ToolsPanel::ExtraToolDefinition>> byPanel;
        for (const AnimeExtraToolDefinition &extra : m_business->loadExtraTools()) {
            ToolsPanel::ExtraToolDefinition tool;
            tool.name = extra.name;
            tool.title = extra.title;
            tool.handler = extra.handler;
            tool.property = extra.property;
            tool.baseTool = extra.baseTool;
            tool.page = extra.page;
            byPanel[panelForPage.value(tool.page, m_mappingToolsPanel)].append(tool);
        }
        for (ToolsPanel *panel : m_toolsPanels) {
            panel->setExtraTools(byPanel.value(panel));
        }
    }

    m_toolOptPanel = toolOptPanel;
    auto loadToolOptions = [this, toolOptPanel](PaintOpenGLWidget::Tool tool) {
        m_currentToolForOptions = int(tool);
        const QJsonObject layout = m_business->toolOptionsLayout(static_cast<AnimeanBusiness::Tool>(int(tool)));
        toolOptPanel->configureLayout(layout);
    };
    m_reloadToolOptions = [loadToolOptions](int tool) {
        loadToolOptions(static_cast<PaintOpenGLWidget::Tool>(tool));
    };

    auto applyTool = [this, toolOptPanel, loadToolOptions](PaintOpenGLWidget::Tool tool, bool reloadOptions) {
        m_business->applyTool(int(tool), reloadOptions);
        const PaintOpenGLWidget::Tool armed =
            static_cast<PaintOpenGLWidget::Tool>(m_business->currentTool());
        for (ToolsPanel *panel : m_toolsPanels) {
            panel->setTool(armed);
        }
        if (armed != tool) {
            return;
        }
        toolOptPanel->setTool(armed);
        m_activeExtraTool.clear();   // a plain tool: nothing extra to rebuild
        m_activeExtraToolProperty.clear();
        if (reloadOptions) {
            loadToolOptions(armed);
        }
    };

    auto selectTool = [applyTool](PaintOpenGLWidget::Tool tool) {
        applyTool(tool, true);
    };

    m_applyTool = [applyTool](int tool, bool reloadOptions) {
        applyTool(static_cast<PaintOpenGLWidget::Tool>(tool), reloadOptions);
    };

    loadToolOptions(PaintOpenGLWidget::Tool::Pen);

    for (ToolsPanel *panel : m_toolsPanels) {
        connect(panel, &ToolsPanel::toolSelected, this, selectTool);
        connect(panel, &ToolsPanel::extraToolSelected, this,
                [this, panel, toolOptPanel](const ToolsPanel::ExtraToolDefinition &tool) {
            // The clicked page already cleared itself; the OTHER pages have to
            // be told, because a check on one page is not exclusive with a
            // check on another.
            for (ToolsPanel *other : m_toolsPanels) {
                if (other != panel) {
                    other->clearSelection();
                }
            }
            AnimeExtraToolDefinition extra;
            extra.name = tool.name;
            extra.title = tool.title;
            extra.handler = tool.handler;
            extra.property = tool.property;
            extra.baseTool = tool.baseTool;
            extra.page = tool.page;
            m_business->selectExtraTool(extra);
            const PaintOpenGLWidget::Tool baseTool =
                static_cast<PaintOpenGLWidget::Tool>(m_business->currentTool());
            toolOptPanel->setTool(baseTool);
            m_activeExtraTool = m_business->activeExtraTool();
            m_activeExtraToolProperty = m_business->activeExtraToolProperty();
        });
    }

    connect(toolOptPanel, &ToolOptPanel::colorSelected, this, [this, applyTool](const QColor &color) {
        // ARM FIRST, PAINT SECOND, in both branches. Arming announces the
        // tool change and the colour policy (pyfile/tool_colors.py) answers
        // it by restoring that tool's remembered colour - so applying the
        // pick before the arm loses the pick to the restore.
        const bool onFill = m_business->currentTool() == int(PaintOpenGLWidget::Tool::Fill);
        applyTool(onFill ? PaintOpenGLWidget::Tool::Fill
                         : PaintOpenGLWidget::Tool::Pen, false);
        m_business->setDrawingColor(color);
    });

    connect(toolOptPanel, &ToolOptPanel::fillScopeSelected, this, [this](PaintOpenGLWidget::FillScope scope) {
        m_toolFillAllLayers = scope == PaintOpenGLWidget::FillScope::AllLayers;
        m_business->setFillScope(int(scope));
    });

    connect(toolOptPanel, &ToolOptPanel::eraserModeSelected, this, [applyTool](PaintOpenGLWidget::Tool tool) {
        applyTool(tool, false);
    });

    connect(toolOptPanel, &ToolOptPanel::smoothValueChanged, this, [this](int value) {
        m_toolSmoothValue = value;
        m_business->setSmoothValue(value);
    });

    connect(toolOptPanel, &ToolOptPanel::penWidthChanged, this, [this](int value) {
        m_toolPenWidth = value;
        m_business->setPenWidth(value);
    });

    connect(toolOptPanel, &ToolOptPanel::optionChanged, this, [this](const QString &hook, const QString &name, const QString &type, const QVariant &value, int row, int startColumn, int endColumn) {
        m_business->sendToolOption(hook, name, type, value, row, startColumn, endColumn);
    });
}

bool MainWindow::isToolLocked(int tool) const
{
    return m_business ? m_business->isToolLocked(tool) : false;
}

void MainWindow::applyLockedTools(const QString &view, const QStringList &tools)
{
    m_business->applyLockedTools(view, tools);
    refreshToolLockState();
}

void MainWindow::refreshToolLockState()
{
    // One rail for the whole application, so it shows the active board's set.
    // Called on both edges of the question: a new set arriving, and the active
    // board changing under the set already stored.
    PaintOpenGLWidget *view = activePaintWidget();
    if (!m_paintingToolsPanel || !view) {
        return;
    }
    for (PaintOpenGLWidget::Tool tool : kLockableTools) {
        m_paintingToolsPanel->setToolEnabled(tool, !isToolLocked(int(tool)));
    }
    // The armed tool may have just been locked out from under the user. Arrow
    // is always available, so it is where the board lands.
    if (m_applyTool && isToolLocked(int(view->tool()))) {
        m_applyTool(int(PaintOpenGLWidget::Tool::Arrow), true);
    }
}

void MainWindow::createListDocks()
{
    // Two layer pages, each nailed to one board. The old single panel followed
    // whichever board was active (through changableTexture), so the layers of
    // the board you were NOT looking at were simply unreachable; a page each
    // means both stacks are always on screen, one tab apart.
    m_mainLayerPanel = new LayerPanel(this);
    m_childLayerPanel = new LayerPanel(this);
    m_assetPanel = new AssetPanel(this);

    m_layerDock = new ParentWindow(QStringLiteral("layers"), QStringLiteral("Layers"), this);
    m_layerDock->addPage(QStringLiteral("main"), QStringLiteral("Main Layers"), m_mainLayerPanel);
    m_layerDock->addPage(QStringLiteral("child"), QStringLiteral("Child Layers"), m_childLayerPanel);
    addDockWidget(Qt::RightDockWidgetArea, m_layerDock);

    m_assetDock = new ParentWindow(QStringLiteral("assets"), QStringLiteral("Assets"), this);
    m_assetDock->addPage(QStringLiteral("assets"), QStringLiteral("Assets"), m_assetPanel);
    addDockWidget(Qt::RightDockWidgetArea, m_assetDock);
    // Hidden by default: layers and frames are the everyday surfaces; the
    // asset list is for reorganising what those cells point AT. The View
    // menu toggle brings it up.
    m_assetDock->hide();
}

void MainWindow::createTimeline()
{
    // The main board's container, asked for by name rather than found by
    // being the central widget: the central widget is the tabbed paint AREA
    // now, and casting it to a container would silently give up the timeline.
    PaintViewContainer *container = m_centralArea ? m_centralArea->mainContainer() : nullptr;
    if (!container) {
        return;
    }
    // Only the MAIN view gets a timeline. It still DRIVES whichever board
    // framePanelTarget() resolves to, exactly as the frames dock did - one
    // timeline, pointed by the child window's Changable Timeline flag.
    //
    // A real dock window, not chrome inside the container: that is what gives
    // the bottom layout the full window width, the transport the title-bar
    // position, the strip a resize splitter and the drag its native preview.
    m_timeline = new TimelineWindow(container, this);
    m_timeline->setThumbnailProvider([this](int frame, QSize size) {
        return m_business->renderFrameThumbnail(frame, size);
    });
    addDockWidget(Qt::BottomDockWidgetArea, m_timeline);

    connect(m_timeline, &TimelineWindow::frameActivated, this, [this](int frame) {
        // Picking a frame by hand means the user is done watching; without
        // this the next tick would snap the highlight back.
        stopPlayback();
        PaintOpenGLWidget *view = framePanelTarget();
        requestAttentionUpdate(view, AttentionChange::FrameChange, frame,
                               attentionFor(view).layer, attentionFor(view).asset);
    });

    connect(m_timeline, &TimelineWindow::addFrameRequested, this, [this]() {
        m_business->addFrame();
    });

    // A hold describes the frame it was asked for: the new row goes directly
    // after the current one and re-exposes it, rather than landing at the end
    // of the sheet where it would hold whatever happens to be last.
    connect(m_timeline, &TimelineWindow::addHoldRequested, this, [this]() {
        m_business->addHoldFrame();
    });

    connect(m_timeline, &TimelineWindow::duplicateFrameRequested, this, [this]() {
        m_business->duplicateFrame();
    });

    connect(m_timeline, &TimelineWindow::deleteFrameRequested, this, [this]() {
        m_business->deleteFrame();
    });

    connect(m_timeline, &TimelineWindow::moveFrameRequested, this, [this](int from, int to) {
        m_business->moveFrame(from, to);
    });

    connect(m_timeline, &TimelineWindow::playRequested, this, &MainWindow::startPlayback);
    connect(m_timeline, &TimelineWindow::pauseRequested, this, &MainWindow::stopPlayback);
    connect(m_timeline, &TimelineWindow::loopToggled, this, [this](bool on) {
        m_playbackLoop = on;
        m_business->setPlaybackLoop(on);
    });

    connect(m_timeline, &TimelineWindow::prevRequested, this, [this]() {
        m_business->previousFrame();
    });
    connect(m_timeline, &TimelineWindow::nextRequested, this, [this]() {
        m_business->nextFrame();
    });

    // The rate belongs to the document, so both a preset and a typed number
    // land in the model; the timeline then re-reads it.
    connect(m_timeline, &TimelineWindow::fpsChanged, this, [this](int fps) {
        m_business->setFps(fps);
    });

    connect(m_timeline, &TimelineWindow::onionToggled, this, [this](bool on) {
        m_business->setOnionEnabled(on);
    });

    connect(m_timeline, &TimelineWindow::onionLinesToggled, this, [this](bool on) {
        m_business->setOnionLines(on);
    });

    connect(m_timeline, &TimelineWindow::onionFillsToggled, this, [this](bool on) {
        m_business->setOnionFills(on);
    });

    connect(m_timeline, &TimelineWindow::onionAmLayersToggled, this, [this](bool on) {
        m_business->setOnionAmLayers(on);
    });

    connect(m_timeline, &TimelineWindow::onionGuideToggled, this, [this](bool on) {
        m_business->setOnionGuideLines(on);
    });

    connect(m_timeline, &TimelineWindow::onionLaneToggled, this, [this](int frame, bool on) {
        m_business->toggleOnionFrame(frame, on);
    });

    for (PaintOpenGLWidget *view : m_paintViews) {
        // A committed edit changes what the cells show, and the cells are
        // pixels of the old scene until they are dropped.
        connect(view, &PaintOpenGLWidget::historyChanged, this, [this]() {
            if (m_timeline) {
                m_timeline->clearThumbnails();
            }
        });
    }

    // After the dock is in the layout: the stored area is applied by
    // re-docking, which only means anything from inside a dock layout.
    m_timeline->restoreLayout();
}

void MainWindow::pullOnionPolicy()
{
    m_business->pullOnionPolicy();
}

void MainWindow::newProject()
{
    // Named "Canvas Size...", not "New": it resizes the page of the document
    // that is already open and deliberately does NOT start a blank one. A
    // menu entry called New that leaves the artwork and the file path in
    // place would be a trap - the next Ctrl+S would write the old drawing
    // back over the file the user thought they had left behind.
    NewProjectDialog dialog(m_business->canvasSize(), this);
    if (dialog.exec() != QDialog::Accepted) {
        return;
    }
    applyNewCanvasSize(dialog.canvasSize());
}

void MainWindow::applyNewCanvasSize(const QSize &size)
{
    m_business->applyNewCanvasSize(size);
    refreshToolOptions();
}

void MainWindow::promptForNewCanvasOnStartup()
{
    NewProjectDialog dialog(m_business->canvasSize(), this);
    // Cancel keeps the default page rather than closing the app: the user
    // asked to be shown a size, not to be blocked by one.
    if (dialog.exec() == QDialog::Accepted) {
        applyNewCanvasSize(dialog.canvasSize());
    }
}

void MainWindow::openProject()
{
    m_currentFilePath = m_business->currentFilePath();
    const QString fileName = QFileDialog::getOpenFileName(
        this,
        QStringLiteral("Open Project"),
        m_currentFilePath.isEmpty() ? QString() : QFileInfo(m_currentFilePath).absolutePath(),
        projectOpenFilter());
    if (fileName.isEmpty()) {
        return;
    }

    loadProjectFrom(fileName);
}

bool MainWindow::saveProject()
{
    // File > Save always means the complete project. Texture-only persistence
    // lives in the Texture View File menu and uses its own .textureview type.
    // Only a native .anproj is a silent Ctrl+S target; anything else (a file
    // opened through the All Files filter under a foreign suffix) routes
    // through Save As so the switch to .anproj is always an explicit,
    // confirmed dialog - never a rewrite of a remembered path that could
    // land on an unrelated file.
    m_currentFilePath = m_business->currentFilePath();
    if (m_currentFilePath.isEmpty()
        || QFileInfo(m_currentFilePath).suffix().compare(QStringLiteral("anproj"), Qt::CaseInsensitive) != 0) {
        return saveProjectAs();
    }
    return saveProjectTo(m_currentFilePath);
}

bool MainWindow::saveProjectAs()
{
    // The suggestion is already migrated to .anproj, so the name the dialog
    // confirms is normally the name that gets written.
    m_currentFilePath = m_business->currentFilePath();
    QString selectedFile = m_currentFilePath.isEmpty()
                               ? QDir::home().filePath(QStringLiteral("untitled.anproj"))
                               : ensureProjectFileExtension(m_currentFilePath);

    QString fileName = QFileDialog::getSaveFileName(
        this,
        QStringLiteral("Save Project As"),
        selectedFile,
        projectSaveFilter());
    if (fileName.isEmpty()) {
        return false;
    }
    return saveProjectTo(fileName);
}

bool MainWindow::saveProjectTo(const QString &fileName)
{
    if (!m_paintWidget || !m_childPaintWidget) {
        return false;
    }

    const QString projectFileName = ensureProjectFileExtension(fileName);
    if (!confirmDivergentOverwrite(fileName, projectFileName, QStringLiteral("Save Project"))) {
        return false;
    }
    QString error;
    if (!m_business->saveProjectTo(projectFileName, &error)) {
        QMessageBox::warning(this, QStringLiteral("Save Project"), error);
        return false;
    }

    m_currentFilePath = m_business->currentFilePath();
    updateWindowTitle();
    return true;
}

bool MainWindow::loadProjectFrom(const QString &fileName)
{
    stopPlayback();
    QString error;
    if (!m_business->loadProjectFrom(fileName, &error)) {
        QMessageBox::warning(this,
                             QStringLiteral("Open Project"),
                             error.isEmpty() ? QStringLiteral("Unsupported project file.") : error);
        return false;
    }

    m_currentFilePath = m_business->currentFilePath();
    m_childFilePath = m_business->childFilePath();
    updateWindowTitle();
    showMainPaintView();
    refreshToolOptions();
    return true;
}

void MainWindow::importRaster(PaintOpenGLWidget *view)
{
    if (!view) {
        return;
    }

    const QString fileName = QFileDialog::getOpenFileName(
        this,
        QStringLiteral("Import Raster into %1 View").arg(view->viewName()),
        QString(),
        QStringLiteral("Images (*.png *.jpg *.jpeg *.bmp *.gif *.webp *.tif *.tiff);;All Files (*)"));
    if (fileName.isEmpty()) {
        return;
    }

    QImageReader reader(fileName);
    reader.setAutoTransform(true);
    QImage image = reader.read();
    if (image.isNull()) {
        QMessageBox::warning(this,
                             QStringLiteral("Import Raster"),
                             QStringLiteral("Failed to load image:\n%1").arg(reader.errorString()));
        return;
    }

    image = image.convertToFormat(QImage::Format_ARGB32_Premultiplied);
    const QFileInfo fileInfo(fileName);
    const int layerIndex = view->importRasterLayer(image, fileInfo.completeBaseName());
    if (layerIndex < 0) {
        QMessageBox::warning(this,
                             QStringLiteral("Import Raster"),
                             QStringLiteral("Failed to import raster layer."));
        return;
    }

    updateAttention(view,
                    AttentionChange::LayerChange,
                    view->model().currentFrame(),
                    layerIndex,
                    view->model().currentAsset());
    setStatusText(QStringLiteral("Imported raster into %1: %2 (%3 x %4)")
                      .arg(view->viewName())
                      .arg(fileInfo.fileName())
                      .arg(image.width())
                      .arg(image.height()));
}

void MainWindow::importOpenToonzLines(PaintOpenGLWidget *view)
{
#ifndef ANIMEAN_WITH_PYTHON
    Q_UNUSED(view);
    QMessageBox::warning(this,
                         QStringLiteral("Import OpenToonz Lines"),
                         QStringLiteral("Python support is disabled, so OpenToonz line import is unavailable."));
    return;
#else
    if (!view) {
        return;
    }

    const QString fileName = QFileDialog::getOpenFileName(
        this,
        QStringLiteral("Import OpenToonz Lines into %1 View").arg(view->viewName()),
        QString(),
        QStringLiteral("OpenToonz Vector Levels (*.pli);;All Files (*)"));
    if (fileName.isEmpty()) {
        return;
    }

    try {
        py::gil_scoped_acquire acquire;
        py::module_ toonzTool = py::module_::import("toonz_to_dict");
        py::object level = toonzTool.attr("read_vector_level")(QDir::toNativeSeparators(fileName).toStdString());
        py::dict levelData = level.attr("to_dict")().cast<py::dict>();
        QVector<PaintOpenGLWidget::ImportedVectorFrame> frames = importedFramesFromOpenToonzLevel(levelData);
        if (frames.isEmpty()) {
            QMessageBox::warning(this,
                                 QStringLiteral("Import OpenToonz Lines"),
                                 QStringLiteral("No strokes were found in this .pli file."));
            return;
        }

        const QRectF sourceBounds = importedVectorFramesBounds(frames);
        // The PAGE, not the viewport: "fit to canvas" has to mean the document,
    // and the message below quotes this same size back to the user.
    const QSizeF canvasSize = view->documentRect().size();
        const QRectF canvasBounds(QPointF(0.0, 0.0), canvasSize);
        const bool needsScale = sourceBounds.isValid()
                                && sourceBounds.width() > 0.0
                                && sourceBounds.height() > 0.0
                                && (!canvasBounds.contains(sourceBounds)
                                    || !qFuzzyCompare(sourceBounds.width(), canvasSize.width())
                                    || !qFuzzyCompare(sourceBounds.height(), canvasSize.height()));
        if (needsScale) {
            const QMessageBox::StandardButton button = QMessageBox::question(
                this,
                QStringLiteral("Import OpenToonz Lines"),
                QStringLiteral("The imported drawing bounds are (%1, %2) %3 x %4, but the current canvas is %5 x %6.\n"
                               "Fit it to the current canvas?")
                    .arg(qRound(sourceBounds.x()))
                    .arg(qRound(sourceBounds.y()))
                    .arg(qRound(sourceBounds.width()))
                    .arg(qRound(sourceBounds.height()))
                    .arg(qRound(canvasSize.width()))
                    .arg(qRound(canvasSize.height())),
                QMessageBox::Yes | QMessageBox::No,
                QMessageBox::Yes);
            if (button == QMessageBox::Yes) {
                scaleImportedVectorFramesToCanvas(&frames, canvasSize);
            }
        }

        const QFileInfo fileInfo(fileName);
        const int layerIndex = view->importVectorLineLayer(frames, fileInfo.completeBaseName());
        if (layerIndex < 0) {
            QMessageBox::warning(this,
                                 QStringLiteral("Import OpenToonz Lines"),
                                 QStringLiteral("Failed to import OpenToonz line layer."));
            return;
        }

        updateAttention(view,
                        AttentionChange::LayerChange,
                        view->model().currentFrame(),
                        layerIndex,
                        view->model().currentAsset());
        setStatusText(QStringLiteral("Imported OpenToonz lines into %1: %2 (%3 frame(s))")
                          .arg(view->viewName())
                          .arg(fileInfo.fileName())
                          .arg(frames.size()));
    } catch (const py::error_already_set &error) {
        QMessageBox::warning(this,
                             QStringLiteral("Import OpenToonz Lines"),
                             QStringLiteral("OpenToonz import failed:\n%1").arg(QString::fromUtf8(error.what())));
    }
#endif
}

void MainWindow::importClipStudioPaint(PaintOpenGLWidget *view)
{
    if (!view) {
        return;
    }

    const QString fileName = QFileDialog::getOpenFileName(
        this,
        QStringLiteral("Import Clip Studio Paint into %1 View").arg(view->viewName()),
        QString(),
        QStringLiteral("Clip Studio Paint (*.clip);;All Files (*)"));
    if (fileName.isEmpty()) {
        return;
    }

    const ClipReader::ClipDocument document = ClipReader::readClipFile(fileName);
    if (!document.valid) {
        QMessageBox::warning(this,
                             QStringLiteral("Import Clip Studio Paint"),
                             document.error.isEmpty()
                                 ? QStringLiteral("Unable to read this .clip file.")
                                 : document.error);
        return;
    }

    QVector<PaintOpenGLWidget::ImportedVectorFrame> frames;
    PaintOpenGLWidget::ImportedVectorFrame frame;
    frame.row = 0;
    for (const ClipReader::ClipStroke &clipStroke : document.strokes) {
        if (clipStroke.points.size() < 2) {
            continue;
        }
        PaintOpenGLWidget::ImportedVectorStroke stroke;
        stroke.points = clipStroke.points;
        stroke.color = clipStroke.color;
        stroke.width = std::max(qreal(1.0), clipStroke.width);
        stroke.path.moveTo(clipStroke.points.first());
        for (int i = 1; i < clipStroke.points.size(); ++i) {
            stroke.path.lineTo(clipStroke.points[i]);
        }
        frame.strokes.append(stroke);
    }
    if (frame.strokes.isEmpty()) {
        QMessageBox::warning(this,
                             QStringLiteral("Import Clip Studio Paint"),
                             QStringLiteral("No usable vector strokes were found in this .clip file."));
        return;
    }
    frames.append(frame);

    const QRectF sourceBounds = importedVectorFramesBounds(frames);
    // The PAGE, not the viewport: "fit to canvas" has to mean the document,
    // and the message below quotes this same size back to the user.
    const QSizeF canvasSize = view->documentRect().size();
    const QRectF canvasBounds(QPointF(0.0, 0.0), canvasSize);
    const bool needsScale = sourceBounds.isValid()
                            && sourceBounds.width() > 0.0
                            && sourceBounds.height() > 0.0
                            && (!canvasBounds.contains(sourceBounds)
                                || !qFuzzyCompare(sourceBounds.width(), canvasSize.width())
                                || !qFuzzyCompare(sourceBounds.height(), canvasSize.height()));
    if (needsScale) {
        const QMessageBox::StandardButton button = QMessageBox::question(
            this,
            QStringLiteral("Import Clip Studio Paint"),
            QStringLiteral("The imported drawing bounds are (%1, %2) %3 x %4, but the current canvas is %5 x %6.\n"
                           "Fit it to the current canvas?")
                .arg(qRound(sourceBounds.x()))
                .arg(qRound(sourceBounds.y()))
                .arg(qRound(sourceBounds.width()))
                .arg(qRound(sourceBounds.height()))
                .arg(qRound(canvasSize.width()))
                .arg(qRound(canvasSize.height())),
            QMessageBox::Yes | QMessageBox::No,
            QMessageBox::Yes);
        if (button == QMessageBox::Yes) {
            scaleImportedVectorFramesToCanvas(&frames, canvasSize);
        }
    }

    const QFileInfo fileInfo(fileName);
    const int layerIndex = view->importVectorLineLayer(frames, fileInfo.completeBaseName());
    if (layerIndex < 0) {
        QMessageBox::warning(this,
                             QStringLiteral("Import Clip Studio Paint"),
                             QStringLiteral("Failed to import the Clip Studio Paint vector layer."));
        return;
    }

    int strokeCount = 0;
    for (const PaintOpenGLWidget::ImportedVectorFrame &imported : frames) {
        strokeCount += imported.strokes.size();
    }
    updateAttention(view,
                    AttentionChange::LayerChange,
                    view->model().currentFrame(),
                    layerIndex,
                    view->model().currentAsset());
    setStatusText(QStringLiteral("Imported Clip Studio Paint into %1: %2 (%3 stroke(s))")
                      .arg(view->viewName())
                      .arg(fileInfo.fileName())
                      .arg(strokeCount));
}

void MainWindow::updateWindowTitle()
{
    if (m_business) {
        setWindowTitle(m_business->windowTitle());
    }
}

void MainWindow::setStatusText(const QString &text)
{
    if (m_business) {
        m_business->setStatusMessage(text);
    }
    statusBar()->showMessage(text);
}

void MainWindow::setPythonUiFrozen(bool frozen)
{
    if (frozen) {
        if (m_pythonFreezeDepth++ > 0) {
            return;
        }
    } else {
        if (m_pythonFreezeDepth <= 0) {
            return;
        }
        --m_pythonFreezeDepth;
        if (m_pythonFreezeDepth > 0) {
            return;
        }
    }

    const bool enabled = !frozen;
    menuBar()->setEnabled(enabled);
    // The central area is not a dock, so the sweep below cannot reach it - and
    // its tab strip is a button that changes which document is on screen.
    if (m_centralArea) {
        m_centralArea->setEnabled(enabled);
    }
    for (PaintOpenGLWidget *view : m_paintViews) {
        if (view) {
            view->setEnabled(enabled);
        }
    }
    // Sub-control frames can be FLOATING top-level windows, which no
    // findChildren over docks sees; and an embedded one is already covered by
    // its host, where enabling twice is free.
    for (SubControlFrame *frame : SubControlRegistry::instance()->frames()) {
        if (frame) {
            frame->setEnabled(enabled);
        }
    }
    const QList<QDockWidget *> docks = findChildren<QDockWidget *>();
    for (QDockWidget *dock : docks) {
        if (dock && dock != m_pythonDebugDock) {
            dock->setEnabled(enabled);
        }
    }
    // The timeline is a dock, so the sweep above covers it; its own
    // changeEvent carries the state on to the pieces that live outside it
    // (the reopen pill, and the transport while the strip is docked to a
    // side), which are the buttons that mutate the script's document.
    if (m_pythonDebugDock) {
        m_pythonDebugDock->setEnabled(true);
    }
    if (m_pythonDebugOutput) {
        m_pythonDebugOutput->setEnabled(true);
    }
    if (m_pythonDebugCommand) {
        m_pythonDebugCommand->setEnabled(true);
    }

    if (frozen) {
        setStatusText(QStringLiteral("Python busy..."));
    } else {
        setStatusText(QStringLiteral("Python ready"));
    }

    QCoreApplication::processEvents(QEventLoop::ExcludeUserInputEvents);
}

void MainWindow::requestAttentionUpdate(PaintOpenGLWidget *view, AttentionChange change, int frame, int layer, int asset)
{
    if (!m_listMousePressed) {
        updateAttention(view, change, frame, layer, asset);
        return;
    }

    m_pendingAttentionChange = change;
    m_pendingAttention.frame = frame;
    m_pendingAttention.layer = layer;
    m_pendingAttention.asset = asset;
    m_pendingAttentionView = view;
    m_hasPendingAttention = true;
}

void MainWindow::updateAttention(PaintOpenGLWidget *view, AttentionChange change, int frame, int layer, int asset)
{
    if (!view || !m_business) {
        return;
    }
    m_business->updateAttention(view->viewName(), change, frame, layer, asset);
}

QVector<QTreeWidgetItem *> MainWindow::layerPanelItems(LayerPanel *panel)
{
    // Display order, depth first, independent of what is expanded.
    QVector<QTreeWidgetItem *> items;
    std::function<void(QTreeWidgetItem *)> walk = [&](QTreeWidgetItem *item) {
        items.append(item);
        for (int i = 0; i < item->childCount(); ++i) {
            walk(item->child(i));
        }
    };
    QTreeWidget *tree = panel->layerList();
    for (int i = 0; i < tree->topLevelItemCount(); ++i) {
        walk(tree->topLevelItem(i));
    }
    return items;
}

void MainWindow::showLayerContextMenu(LayerPanel *panel, PaintOpenGLWidget *view, const QPoint &pos)
{
#ifdef ANIMEAN_WITH_PYTHON
    QTreeWidget *tree = panel->layerList();
    QTreeWidgetItem *item = tree->itemAt(pos);

    // No row under the cursor is still a menu: providers get kind "panel"
    // and typically answer with creation entries (new line / fill /
    // auto-mapping layer) - the layer view's own "establish typed layers"
    // surface.
    const int groupId = item ? item->data(0, kGroupIdRole).toInt() : 0;
    const int layerIndex =
        (item && groupId <= 0) ? item->data(0, Qt::UserRole).toInt() : -1;
    // A group's members, flattened, so a provider can inspect what it holds
    // without needing its own view of the tree.
    QVector<int> members;
    if (item && groupId > 0) {
        std::function<void(QTreeWidgetItem *)> walk = [&](QTreeWidgetItem *node) {
            for (int i = 0; i < node->childCount(); ++i) {
                QTreeWidgetItem *child = node->child(i);
                if (child->data(0, kGroupIdRole).toInt() > 0) {
                    walk(child);
                } else {
                    members.append(child->data(0, Qt::UserRole).toInt());
                }
            }
        };
        walk(item);
    }

    // Python decides what this row offers; C++ only renders and reports.
    QJsonArray entries;
    try {
        py::dict context;
        context["view"] = view->viewName().toStdString();
        context["kind"] = !item ? "panel" : (groupId > 0 ? "group" : "layer");
        context["group"] = groupId;
        context["group_name"] = item ? item->text(0).toStdString() : std::string();
        context["layer"] = layerIndex;
        context["layer_name"] = layerIndex >= 0 ? view->layerName(layerIndex).toStdString()
                                                : std::string();
        // Stable identity + unit ownership, so a provider can key per-layer
        // state without re-deriving the tree: the column id, the row's own
        // group tag (group rows), and for a layer row the innermost group
        // that contains it plus that group's tag.
        context["layer_id"] = layerIndex >= 0 ? view->model().layerIdAt(layerIndex) : 0;
        context["tag"] = groupId > 0 ? view->model().layerGroupTag(groupId).toStdString()
                                     : std::string();
        const int ownerGroup =
            layerIndex >= 0 ? view->model().groupIdForLayer(layerIndex) : 0;
        context["owner_group"] = ownerGroup;
        context["owner_tag"] = ownerGroup > 0
            ? view->model().layerGroupTag(ownerGroup).toStdString()
            : std::string();
        // Layer PARENTING (AnimeColumn::parentLayerId), which the panel
        // renders as nesting: the id of the layer this row tracks (0 when
        // independent) and how many rows track THIS one. A provider needs
        // both to offer "stop tracking" on a child and nothing on a parent.
        context["parent_layer_id"] =
            layerIndex >= 0 ? view->model().layerParentId(layerIndex) : 0;
        context["child_count"] =
            layerIndex >= 0 ? view->model().childLayerIndices(layerIndex).size() : 0;
        py::list memberList;
        for (int index : members) {
            memberList.append(index);
        }
        context["members"] = memberList;

        const std::string json = py::module_::import("python_hooks")
                                     .attr("menu_items_json")(context)
                                     .cast<std::string>();
        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(QByteArray::fromStdString(json), &parseError);
        // A script problem costs the script's entries and nothing else - the
        // built-in group actions below must not depend on Python being well.
        if (parseError.error == QJsonParseError::NoError && document.isArray()) {
            entries = document.array();
        }
    } catch (const py::error_already_set &error) {
        setStatusText(QStringLiteral("layer menu error: %1").arg(QString::fromUtf8(error.what())));
    }
    QMenu menu(this);
    if (groupId > 0) {
        // Built in, not script-provided: ungrouping is a generic layer
        // operation with no tool semantics, so C++ owns it. It is the
        // counterpart to Remove Layer, which deletes the group's contents.
        QAction *ungroup = menu.addAction(QStringLiteral("Ungroup (keep the layers)"));
        connect(ungroup, &QAction::triggered, this, [this, view, groupId]() {
            if (m_business->dissolveLayerGroup(groupId, view->viewName())) {
                refreshPanelTargets();
            }
        });
        QAction *deleteGroup = menu.addAction(QStringLiteral("Delete Group and Layers"));
        connect(deleteGroup, &QAction::triggered, this, [this, view, groupId]() {
            m_business->deleteLayerGroup(groupId, view->viewName());
        });
        if (!entries.isEmpty()) {
            menu.addSeparator();
        }
    }
    if (groupId <= 0 && entries.isEmpty()) {
        return;
    }
    for (const QJsonValue &value : entries) {
        const QJsonObject object = value.toObject();
        const QString kind = object.value(QStringLiteral("kind")).toString(QStringLiteral("action"));
        if (kind == QStringLiteral("separator")) {
            menu.addSeparator();
            continue;
        }
        const QString name = object.value(QStringLiteral("name")).toString();
        if (name.isEmpty()) {
            continue;
        }
        QAction *action = menu.addAction(object.value(QStringLiteral("title")).toString(name));
        action->setEnabled(object.value(QStringLiteral("enabled")).toBool(true));
        if (kind == QStringLiteral("settings")) {
            // Same declarative contract as the menu bar (fillScriptMenu): the
            // settings dialog opens from the Qt trigger, never from inside a
            // Python-dispatched handler. The provider that produced this
            // entry saw the full row context, so per-row state (WHICH layer
            // the window edits) is the provider's to stash.
            const QString target = object.value(QStringLiteral("settings")).toString(name);
            const QString title = object.value(QStringLiteral("title")).toString(name);
            connect(action, &QAction::triggered, this, [this, target, title]() {
                openScriptSettings(target, title);
            });
            continue;
        }
        const QString groupName = item ? item->text(0) : QString();
        const QString layerName = layerIndex >= 0 ? view->layerName(layerIndex) : QString();
        connect(action, &QAction::triggered, this,
                [this, view, name, groupId, groupName, layerIndex, layerName, members]() {
            view->sendPythonLayerMenuMessage(name, groupId, groupName,
                                             layerIndex, layerName, members);
            // The handler may have edited the document (that is the point),
            // so resync rather than trusting the panel to still be right.
            refreshPanelTargets();
        });
    }
    if (!menu.isEmpty()) {
        menu.exec(tree->viewport()->mapToGlobal(pos));
    }
#else
    Q_UNUSED(panel);
    Q_UNUSED(view);
    Q_UNUSED(pos);
#endif
}

void MainWindow::applyLayerPanelStructure(LayerPanel *panel, PaintOpenGLWidget *view, int movedColumnId)
{
    AnimeSceneModel &model = view->model();
    QTreeWidget *tree = panel->layerList();

    // Capture the widget as a node tree BEFORE touching the columns. Leaves
    // are recorded by stable column id, so the reorder below - which shifts
    // every index after it - cannot invalidate what we captured.
    //
    // Rows a LEAF hosts (a layer nested under the one it tracks) are collected
    // OUT of the recursion instead of being written next to their parent:
    // appending them where the leaf sits would put them inside whatever group
    // the leaf is in, making group membership follow a parent link the user
    // never dragged. They are put back below, each in its own container.
    QVector<AnimeLayerNode> hosted;
    std::function<QVector<AnimeLayerNode>(QTreeWidgetItem *)> capture =
        [&](QTreeWidgetItem *parent) {
        QVector<AnimeLayerNode> nodes;
        const int count = parent ? parent->childCount() : tree->topLevelItemCount();
        for (int i = 0; i < count; ++i) {
            QTreeWidgetItem *item = parent ? parent->child(i) : tree->topLevelItem(i);
            AnimeLayerNode node;
            const int groupId = item->data(0, kGroupIdRole).toInt();
            if (groupId > 0) {
                node.groupId = groupId;
                node.name = item->text(0);
                node.collapsed = !item->isExpanded();
                // The widget carries no role for the script-owned tag, so it
                // is re-read from the model by id - without this, one drag
                // reorder stripped "automapping" off every unit group and
                // orphaned its config.
                node.tag = model.layerGroupTag(groupId);
                node.children = capture(item);
                if (node.children.isEmpty()) {
                    continue;
                }
            } else {
                node.layerId = model.layerIdAt(item->data(0, Qt::UserRole).toInt());
                if (node.layerId <= 0) {
                    continue;
                }
                nodes.append(node);
                // A leaf can now HOLD rows: the panel nests a layer under the
                // one it tracks. That nesting is a column property, so it is
                // captured FLAT, never as tree children - a leaf has nowhere
                // to put children in the model or the file format, and
                // normalizeLayerTree would re-adopt them to the top level on
                // the very next read.
                hosted.append(capture(item));
                continue;
            }
            nodes.append(node);
        }
        return nodes;
    };
    QVector<AnimeLayerNode> captured = capture(nullptr);

    if (!hosted.isEmpty()) {
        QHash<int, int> groupForLayer;
        std::function<void(const QVector<AnimeLayerNode> &, int)> readGroups =
            [&](const QVector<AnimeLayerNode> &nodes, int groupId) {
            for (const AnimeLayerNode &node : nodes) {
                if (node.isGroup()) {
                    readGroups(node.children, node.groupId);
                } else {
                    groupForLayer.insert(node.layerId, groupId);
                }
            }
        };
        readGroups(model.layerTree(), 0);

        std::function<AnimeLayerNode *(QVector<AnimeLayerNode> &, int)> findGroup =
            [&](QVector<AnimeLayerNode> &nodes, int groupId) -> AnimeLayerNode * {
            for (AnimeLayerNode &node : nodes) {
                if (!node.isGroup()) {
                    continue;
                }
                if (node.groupId == groupId) {
                    return &node;
                }
                if (AnimeLayerNode *found = findGroup(node.children, groupId)) {
                    return found;
                }
            }
            return nullptr;
        };

        for (const AnimeLayerNode &node : hosted) {
            const int groupId = groupForLayer.value(node.layerId, 0);
            AnimeLayerNode *group = groupId > 0 ? findGroup(captured, groupId) : nullptr;
            if (group) {
                group->children.append(node);
            } else {
                captured.append(node);
            }
        }
    }

    QVector<QPair<int, int>> flatOrder;
    for (QTreeWidgetItem *item : layerPanelItems(panel)) {
        flatOrder.append(qMakePair(item->data(0, kGroupIdRole).toInt(),
                                   item->data(0, Qt::UserRole).toInt()));
    }

    m_business->reorderLayerTree(view->viewName(), captured, movedColumnId, flatOrder);
}

void MainWindow::refreshLayerLists()
{
    for (LayerPanel *panel : {m_mainLayerPanel, m_childLayerPanel}) {
        PaintOpenGLWidget *view = viewForLayerPanel(panel);
        refreshLayerList(panel, view, attentionFor(view).layer);
    }
}

void MainWindow::refreshLayerList(LayerPanel *panel, PaintOpenGLWidget *view, int selectedRow)
{
    QTreeWidget *tree = panel->layerList();
    const QVector<AnimeLayerPanelRow> rows = m_business->layerRowsForView(view->viewName());

    const QTreeWidgetItem *currentItem = tree->currentItem();
    const int previousLayer = currentItem ? currentItem->data(0, Qt::UserRole).toInt() : -1;

    // Saved and restored rather than cleared: the two pages refresh back to
    // back, and the first one finishing must not unguard the second.
    const bool wasRefreshing = m_refreshingLists;
    m_refreshingLists = true;
    const QSignalBlocker blocker(tree);

    // Same rows in the same shape means this refresh carries an ATTRIBUTE
    // change - a visibility toggle, a rename - and rebuilding the widget for
    // it is both wasteful and destructive: clear() drops the viewport's
    // scroll position (and every expanded state), so a user reading row 80 of
    // 100 was thrown to wherever the current layer happened to sit the moment
    // they ticked a checkbox.
    QVector<QTreeWidgetItem *> existing = layerPanelItems(panel);
    bool sameRows = existing.size() == rows.size();
    for (int i = 0; sameRows && i < rows.size(); ++i) {
        const QTreeWidgetItem *item = existing[i];
        // DEPTH is part of the comparison. Without it a widget whose nesting
        // disagreed with the model still counted as "same rows", so the
        // in-place path preserved the wrong shape forever instead of
        // rebuilding it from the document.
        int depth = 0;
        for (const QTreeWidgetItem *parent = item->parent(); parent; parent = parent->parent()) {
            ++depth;
        }
        sameRows = item->data(0, kGroupIdRole).toInt() == rows[i].groupId
                   && item->data(0, Qt::UserRole).toInt() == rows[i].layerIndex
                   && depth == rows[i].depth;
    }

    // A tracked child reads as secondary artwork, so it takes the palette's
    // disabled text brush rather than a literal colour; an independent row
    // takes the default brush back.
    const QBrush childBrush = tree->palette().brush(QPalette::Disabled, QPalette::Text);

    int restoreScroll = -1;
    if (sameRows) {
        for (int i = 0; i < rows.size(); ++i) {
            QTreeWidgetItem *item = existing[i];
            if (item->text(0) != rows[i].name) {
                item->setText(0, rows[i].name);
            }
            if (rows[i].group) {
                if (item->isExpanded() == rows[i].collapsed) {
                    item->setExpanded(!rows[i].collapsed);
                }
                continue;
            }
            const QBrush wanted = rows[i].child ? childBrush : QBrush();
            if (item->foreground(0) != wanted) {
                item->setForeground(0, wanted);
            }
            const Qt::CheckState state = rows[i].visible ? Qt::Checked : Qt::Unchecked;
            if (item->checkState(0) != state) {
                item->setCheckState(0, state);
            }
        }
    } else {
        const int scroll = tree->verticalScrollBar()->value();
        tree->clear();
        QVector<QTreeWidgetItem *> stack;   // stack[d] = the open parent at depth d
        for (const AnimeLayerPanelRow &row : rows) {
            QTreeWidgetItem *item = new QTreeWidgetItem;
            item->setText(0, row.name);
            item->setData(0, Qt::UserRole, row.layerIndex);
            item->setData(0, kGroupIdRole, row.groupId);
            if (row.group) {
                // Groups are containers: no visibility of their own, and not
                // a drop target for reordering.
                item->setFlags((item->flags() | Qt::ItemIsDragEnabled)
                               & ~Qt::ItemIsUserCheckable);
                QFont font = item->font(0);
                font.setBold(true);
                item->setFont(0, font);
            } else {
                // A layer may be dragged, but nothing may be dropped INTO it:
                // the model has no way to express a layer inside a layer, and
                // the widget happily drew one (complete with an expander) that
                // no refresh could ever repair.
                // Still not a drop target even when it HOSTS tracked children:
                // parenting is set by the fill tool and cleared by the context
                // menu, never by dragging one row onto another.
                item->setFlags((item->flags() | Qt::ItemIsUserCheckable)
                               & ~Qt::ItemIsDropEnabled);
                item->setCheckState(0, row.visible ? Qt::Checked : Qt::Unchecked);
                if (row.child) {
                    item->setForeground(0, childBrush);
                }
            }
            if (row.depth > 0 && row.depth - 1 < stack.size() && stack[row.depth - 1]) {
                stack[row.depth - 1]->addChild(item);
            } else {
                tree->addTopLevelItem(item);
            }
            stack.resize(row.depth + 1);
            // A LEAF that hosts tracked children takes a slot too, which is
            // the one thing the groups-only stack could not express.
            stack[row.depth] = (row.group || row.parent) ? item : nullptr;
            if (row.group) {
                item->setExpanded(!row.collapsed);
            } else if (row.parent) {
                // No stored collapse state for a parent LEAF (the document
                // only tracks it for groups), so a tracked child is visible
                // by default rather than hidden behind an expander.
                item->setExpanded(true);
            }
        }
        if (previousLayer == selectedRow) {
            // The rows changed but the user's selection did not, so this is
            // not a "go look over here" event - put the viewport back where
            // they left it. Applied after the selection below, which would
            // otherwise scroll the selection into view and undo it.
            restoreScroll = scroll;
        }
    }

    QTreeWidgetItem *selectedItem = nullptr;
    if (selectedRow >= 0) {
        for (QTreeWidgetItem *item : layerPanelItems(panel)) {
            if (item->data(0, kGroupIdRole).toInt() == 0
                && item->data(0, Qt::UserRole).toInt() == selectedRow) {
                selectedItem = item;
                break;
            }
        }
    }
    if (selectedItem) {
        // A selected layer inside a collapsed group stays reachable WITHOUT
        // forcing the group open: the selection lands on the outermost
        // collapsed ancestor instead. Force-expanding here defeated the
        // one-row look of an auto-mapping unit (whose member is the current
        // layer whenever the unit is focused), and the next panel drag then
        // wrote collapsed=false into the document permanently.
        QTreeWidgetItem *display = selectedItem;
        for (QTreeWidgetItem *parent = selectedItem->parent(); parent; parent = parent->parent()) {
            if (!parent->isExpanded()) {
                display = parent;
            }
        }
        if (tree->currentItem() != display) {
            tree->setCurrentItem(display);
        }
    } else {
        tree->clearSelection();
        tree->setCurrentItem(nullptr);
    }
    if (restoreScroll >= 0) {
        tree->verticalScrollBar()->setValue(restoreScroll);
    }
    m_refreshingLists = wasRefreshing;
}

void MainWindow::refreshTimeline()
{
    if (!m_timeline || !m_business) {
        return;
    }
    const AnimeTimelineState state = m_business->timelineState();
    m_timeline->setFrameData(state.frameCount, state.currentFrame, state.holds);
    m_timeline->setFrameNames(state.frameNames);
    m_timeline->setFps(state.fps);
    m_timeline->setPlaybackActive(state.playbackActive);
    m_timeline->setLoop(state.loop);
    m_timeline->setOnionAvailable(state.onionAvailable);
    m_timeline->setOnionState(state.onionEnabled, state.onionLines, state.onionFills,
                              state.onionAmLayers, state.onionGuideLines, state.onionFrames);
}

void MainWindow::refreshAssetList(int selectedRow)
{
    QListWidget *list = m_assetPanel->assetList();
    m_refreshingLists = true;
    const QSignalBlocker blocker(list);
    // Same reasoning as refreshLayerList.
    const int previousRow = list->currentRow();
    const int scroll = list->verticalScrollBar()->value();
    list->clear();
    const QStringList names = m_business->visibleAssetNames();
    for (const QString &name : names) {
        list->addItem(name);
    }
    if (selectedRow >= 0 && list->count() > 0) {
        if (selectedRow >= list->count()) {
            selectedRow = list->count() - 1;
        }
        list->setCurrentRow(selectedRow);
        if (previousRow == selectedRow) {
            list->verticalScrollBar()->setValue(scroll);
        }
    } else {
        list->clearSelection();
        list->setCurrentRow(-1);
        list->verticalScrollBar()->setValue(scroll);
    }
    m_refreshingLists = false;
}


