// 界面绑定层。由 VibeFrontend 导出，不要手改：下次导出会整个覆盖。
//
// 这个文件分两部分：
//   文件末尾“生成的部分”随设计项目变化：控件树、位置、排版、事件的连接、业务接口的实现、效果的调用；
//   其余是固定的：把逻辑脚本放进 Qt 自带的 JS 引擎运行，把鼠标事件交给它，再把算出的结果写到控件上。
#include "Ui.h"

#include <QAbstractAnimation>
#include <QAbstractItemModel>
#include <QAbstractSlider>
#include <QAction>
#include <QActionGroup>
#include <QApplication>
#include <QCheckBox>
#include <QComboBox>
#include <QDialog>
#include <QDialogButtonBox>
#include <QDockWidget>
#include <QEvent>
#include <QFile>
#include <QFrame>
#include <QGridLayout>
#include <QHBoxLayout>
#include <QHash>
#include <QHeaderView>
#include <QIcon>
#include <QJSEngine>
#include <QJSValue>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonValue>
#include <QKeySequence>
#include <QLabel>
#include <QLayout>
#include <QLineEdit>
#include <QListWidget>
#include <QMainWindow>
#include <QMenu>
#include <QMenuBar>
#include <QMetaMethod>
#include <QMouseEvent>
#include <QPainter>
#include <QPixmap>
#include <QPlainTextEdit>
#include <QPointer>
#include <QPushButton>
#include <QScrollBar>
#include <QSignalBlocker>
#include <QSizePolicy>
#include <QSlider>
#include <QSpinBox>
#include <QStatusBar>
#include <QTabBar>
#include <QTimer>
#include <QTreeWidget>
#include <QTreeWidgetItem>
#include <QVBoxLayout>
#include <QVariant>
// （这个设计项目没有用到别的 Qt 控件类）

namespace vf {

namespace {

// 过渡动画超过它自己的时长这么多毫秒还没有结束，就不再等它
const int kTransitionGraceMs = 300;

struct PendingEvent
{
    QString kind;
    QString name;
    QJSValue args;
};

// 设计项目里的一个控件
struct Control
{
    QString id;
    QWidget *widget = nullptr;
    // 控件属性名 → Qt 属性名
    QList<QPair<QString, QByteArray>> props;
    // 显示和隐藏时播放的效果的编号，没有是 -1
    int effect = -1;
    bool shown = true;
    // 每次显示或隐藏加一，用来丢弃被打断的过渡
    int generation = 0;
    // 画布上定下的位置和大小，过渡结束后恢复成它
    QRect designRect;
    // 正在过渡中，以及这次过渡的动画
    bool transitioning = false;
    QPointer<QAbstractAnimation> transition;
    // 下面三项只有外部容器用
    QVBoxLayout *hostLayout = nullptr;
    QLabel *placeholder = nullptr;
    QPointer<QWidget> hosted;
};

// 与 model.ts 中 computeFlowRows / flowHeightForWidth 完全一致的换行流式布局
class VfFlowLayout : public QLayout
{
public:
    struct FlowItem
    {
        QLayoutItem *item = nullptr;
        QWidget *widget = nullptr;
        int prefW = 100;
        int prefH = 32;
        int minW = 0;
        int maxW = 1000000;
        int stretch = 0;
    };

    VfFlowLayout(QWidget *parent, int padLeft, int padTop, int padRight, int padBottom,
                 int colGap, int rowGap, int minContainerH, int maxContainerH, bool autoHeight)
        : QLayout(parent)
        , m_padLeft(padLeft)
        , m_padTop(padTop)
        , m_padRight(padRight)
        , m_padBottom(padBottom)
        , m_colGap(colGap)
        , m_rowGap(rowGap)
        , m_minContainerH(minContainerH)
        , m_maxContainerH(maxContainerH)
        , m_autoHeight(autoHeight)
    {
        setContentsMargins(0, 0, 0, 0);
    }

    ~VfFlowLayout() override
    {
        for (const FlowItem &fi : m_items)
            delete fi.item;
    }

    void addFlowWidget(QWidget *w, int prefW, int prefH, int minW, int maxW, int stretch)
    {
        addChildWidget(w);
        m_items.append({ new QWidgetItem(w), w, prefW, prefH, minW, maxW, stretch });
    }

    void addItem(QLayoutItem *item) override
    {
        m_items.append({ item, item->widget(), 100, 32, 0, 1000000, 0 });
    }

    int count() const override { return int(m_items.size()); }
    QLayoutItem *itemAt(int index) const override
    {
        return (index >= 0 && index < m_items.size()) ? m_items.at(index).item : nullptr;
    }
    QLayoutItem *takeAt(int index) override
    {
        if (index < 0 || index >= m_items.size())
            return nullptr;
        return m_items.takeAt(index).item;
    }

    bool hasHeightForWidth() const override { return true; }
    int heightForWidth(int width) const override
    {
        return qBound(m_minContainerH, doLayout(QRect(0, 0, width, 0), false), m_maxContainerH);
    }

    QSize sizeHint() const override { return minimumSize(); }
    QSize minimumSize() const override
    {
        const int w = parentWidget() && parentWidget()->width() > 0 ? parentWidget()->width() : 400;
        return QSize(m_padLeft + m_padRight, heightForWidth(w));
    }

    void setGeometry(const QRect &rect) override
    {
        QLayout::setGeometry(rect);
        const int rawH = doLayout(rect, true);
        const int targetH = qBound(m_minContainerH, rawH, m_maxContainerH);
        if (m_autoHeight) {
            if (QWidget *pw = parentWidget()) {
                if (pw->height() != targetH) {
                    pw->setFixedHeight(targetH);
                    if (pw->parentWidget() && pw->parentWidget()->layout())
                        pw->parentWidget()->layout()->activate();
                }
            }
        }
    }

private:
    int doLayout(const QRect &rect, bool apply) const
    {
        const int innerW = qMax(0, rect.width() - m_padLeft - m_padRight);
        QList<FlowItem> visible;
        for (const FlowItem &fi : m_items) {
            if (fi.widget && !fi.widget->isHidden())
                visible.append(fi);
        }
        if (visible.isEmpty())
            return m_padTop + m_padBottom;

        struct Row
        {
            QList<FlowItem> items;
            int height = 0;
        };
        QList<Row> rows;
        QList<FlowItem> current;
        int usedW = 0;

        for (const FlowItem &fi : visible) {
            const int gapBefore = current.isEmpty() ? 0 : m_colGap;
            if (!current.isEmpty() && usedW + gapBefore + fi.prefW > innerW) {
                int rh = 0;
                for (const FlowItem &it : current)
                    rh = qMax(rh, it.prefH);
                rows.append({ current, rh });
                current.clear();
                current.append(fi);
                usedW = fi.prefW;
            } else {
                current.append(fi);
                usedW += gapBefore + fi.prefW;
            }
        }
        if (!current.isEmpty()) {
            int rh = 0;
            for (const FlowItem &it : current)
                rh = qMax(rh, it.prefH);
            rows.append({ current, rh });
        }

        if (apply) {
            int cursorY = rect.y() + m_padTop;
            for (const Row &row : rows) {
                int totalStretch = 0;
                int fixedSum = 0;
                for (const FlowItem &it : row.items) {
                    if (it.stretch > 0)
                        totalStretch += it.stretch;
                    else
                        fixedSum += it.prefW;
                }
                const int totalGaps = m_colGap * qMax(0, int(row.items.size()) - 1);
                const int leftover = qMax(0, innerW - totalGaps - fixedSum);
                int cursorX = rect.x() + m_padLeft;
                for (const FlowItem &it : row.items) {
                    const int w = (it.stretch > 0 && totalStretch > 0)
                        ? qBound(it.minW, qRound(double(leftover * it.stretch) / double(totalStretch)), it.maxW)
                        : it.prefW;
                    it.widget->setGeometry(cursorX, cursorY, w, it.prefH);
                    cursorX += w + m_colGap;
                }
                cursorY += row.height + m_rowGap;
            }
        }

        int totalRowH = 0;
        for (const Row &row : rows)
            totalRowH += row.height;
        return m_padTop + m_padBottom + totalRowH + m_rowGap * qMax(0, int(rows.size()) - 1);
    }

    QList<FlowItem> m_items;
    int m_padLeft = 0, m_padTop = 0, m_padRight = 0, m_padBottom = 0;
    int m_colGap = 0, m_rowGap = 0;
    int m_minContainerH = 0, m_maxContainerH = 1000000;
    bool m_autoHeight = true;
};

QIcon makeVectorIcon(const QString &name)
{
    if (name.isEmpty())
        return QIcon();
    QPixmap pix(16, 16);
    pix.fill(Qt::transparent);
    QPainter p(&pix);
    p.setRenderHint(QPainter::Antialiasing);
    QPen pen(QColor(226, 232, 240), 1.6, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin);
    p.setPen(pen);
    if (name == QLatin1String("pen") || name == QLatin1String("brush")) {
        p.drawLine(QPointF(3, 13), QPointF(12, 4));
        p.drawEllipse(QPointF(12, 4), 1.5, 1.5);
    } else if (name == QLatin1String("eraser")) {
        p.drawRoundedRect(QRectF(3, 5, 10, 6), 1.5, 1.5);
        p.drawLine(QPointF(2, 13), QPointF(14, 13));
    } else if (name == QLatin1String("fill") || name == QLatin1String("bucket")) {
        p.drawEllipse(QPointF(8, 9), 4, 4);
        p.drawLine(QPointF(8, 3), QPointF(8, 6));
    } else if (name == QLatin1String("connect") || name == QLatin1String("remap")) {
        p.drawEllipse(QPointF(4, 8), 2, 2);
        p.drawEllipse(QPointF(12, 8), 2, 2);
        p.drawLine(QPointF(6, 8), QPointF(10, 8));
    } else if (name == QLatin1String("arrow") || name == QLatin1String("transfer")) {
        p.drawLine(QPointF(3, 8), QPointF(13, 8));
        p.drawLine(QPointF(9, 4), QPointF(13, 8));
        p.drawLine(QPointF(9, 12), QPointF(13, 8));
    } else if (name == QLatin1String("play")) {
        QPolygonF poly;
        poly << QPointF(5, 3) << QPointF(13, 8) << QPointF(5, 13);
        p.setBrush(QColor(226, 232, 240));
        p.drawPolygon(poly);
    } else if (name == QLatin1String("pause")) {
        p.drawLine(QPointF(6, 4), QPointF(6, 12));
        p.drawLine(QPointF(10, 4), QPointF(10, 12));
    } else if (name == QLatin1String("prev")) {
        p.drawLine(QPointF(4, 4), QPointF(4, 12));
        p.drawLine(QPointF(12, 4), QPointF(6, 8));
        p.drawLine(QPointF(12, 12), QPointF(6, 8));
    } else if (name == QLatin1String("next")) {
        p.drawLine(QPointF(12, 4), QPointF(12, 12));
        p.drawLine(QPointF(4, 4), QPointF(10, 8));
        p.drawLine(QPointF(4, 12), QPointF(10, 8));
    } else if (name == QLatin1String("add")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(3, 8), QPointF(13, 8));
    } else if (name == QLatin1String("remove")) {
        p.drawLine(QPointF(3, 8), QPointF(13, 8));
    } else if (name == QLatin1String("up")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(4, 7), QPointF(8, 3));
        p.drawLine(QPointF(12, 7), QPointF(8, 3));
    } else if (name == QLatin1String("down")) {
        p.drawLine(QPointF(8, 3), QPointF(8, 13));
        p.drawLine(QPointF(4, 9), QPointF(8, 13));
        p.drawLine(QPointF(12, 9), QPointF(8, 13));
    } else {
        p.drawRoundedRect(QRectF(3, 3, 10, 10), 2, 2);
    }
    return QIcon(pix);
}

bool evalVisibleWhen(const QString &expr, const QVariantMap &values)
{
    const QString s = expr.trimmed();
    if (s.isEmpty())
        return true;
    if (s.contains(QStringLiteral("||"))) {
        for (const QString &part : s.split(QStringLiteral("||"))) {
            if (evalVisibleWhen(part, values))
                return true;
        }
        return false;
    }
    if (s.contains(QStringLiteral("&&"))) {
        for (const QString &part : s.split(QStringLiteral("&&"))) {
            if (!evalVisibleWhen(part, values))
                return false;
        }
        return true;
    }
    const int neIdx = s.indexOf(QStringLiteral("!="));
    if (neIdx > 0) {
        const QString key = s.left(neIdx).trimmed();
        QString rhs = s.mid(neIdx + 2).trimmed();
        if ((rhs.startsWith(QLatin1Char('\'')) && rhs.endsWith(QLatin1Char('\''))) ||
            (rhs.startsWith(QLatin1Char('"')) && rhs.endsWith(QLatin1Char('"')))) {
            rhs = rhs.mid(1, rhs.size() - 2);
        }
        return values.value(key).toString() != rhs;
    }
    const int eqIdx = s.indexOf(QStringLiteral("=="));
    if (eqIdx > 0) {
        const QString key = s.left(eqIdx).trimmed();
        QString rhs = s.mid(eqIdx + 2).trimmed();
        if ((rhs.startsWith(QLatin1Char('\'')) && rhs.endsWith(QLatin1Char('\''))) ||
            (rhs.startsWith(QLatin1Char('"')) && rhs.endsWith(QLatin1Char('"')))) {
            rhs = rhs.mid(1, rhs.size() - 2);
        }
        return values.value(key).toString() == rhs;
    }
    if (s.startsWith(QLatin1Char('!')))
        return !values.value(s.mid(1).trimmed()).toBool();
    return values.value(s).toBool();
}

bool evalVisibleWhenVariant(const QVariant &vw, const QVariantMap &values)
{
    if (!vw.isValid() || vw.isNull())
        return true;
    if (vw.typeId() == QMetaType::QVariantMap) {
        const QVariantMap cond = vw.toMap();
        const QString target = cond.value(QStringLiteral("control")).toString();
        if (target.isEmpty())
            return true;
        const QVariant actual = values.value(target);
        if (cond.contains(QStringLiteral("equals")))
            return actual == cond.value(QStringLiteral("equals"));
        if (cond.contains(QStringLiteral("not_equals")))
            return actual != cond.value(QStringLiteral("not_equals"));
        if (cond.contains(QStringLiteral("in")))
            return cond.value(QStringLiteral("in")).toList().contains(actual);
        return true;
    }
    return evalVisibleWhen(vw.toString(), values);
}

struct FlatTreeRow
{
    int index = 0;
    QString id;
    QString name;
    QString kind;
    int depth = 0;
    bool isGroup = false;
    bool collapsed = false;
    bool checked = true;
    bool locked = false;
    bool hiddenByAncestor = false;
};

void flattenTreeVariantList(const QVariantList &list, int depth, bool parentCollapsed, QList<FlatTreeRow> &out)
{
    for (const QVariant &it : list) {
        const int idx = int(out.size());
        if (it.typeId() == QMetaType::QVariantMap) {
            const QVariantMap map = it.toMap();
            QString name = map.value(QStringLiteral("name")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("label")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("title")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("text")).toString();
            if (name.isEmpty()) name = map.value(QStringLiteral("id")).toString();
            QString id = map.value(QStringLiteral("id")).toString();
            if (id.isEmpty()) id = map.value(QStringLiteral("name"), idx).toString();
            const QString kind = map.value(QStringLiteral("kind"), map.value(QStringLiteral("type"))).toString();
            const QVariantList children = map.value(QStringLiteral("children")).toList();
            const bool isGroup = map.value(QStringLiteral("isGroup")).toBool() ||
                                 kind == QLatin1String("group") || !children.isEmpty();
            const bool collapsed = map.value(QStringLiteral("collapsed")).toBool();
            const bool checked = map.contains(QStringLiteral("visible"))
                ? map.value(QStringLiteral("visible")).toBool()
                : map.value(QStringLiteral("checked"), true).toBool();
            const bool locked = map.value(QStringLiteral("locked")).toBool();
            const int d = map.contains(QStringLiteral("depth")) ? map.value(QStringLiteral("depth")).toInt() : depth;
            out.append({ idx, id, name, kind, d, isGroup, collapsed, checked, locked, parentCollapsed });
            if (!children.isEmpty())
                flattenTreeVariantList(children, d + 1, parentCollapsed || collapsed, out);
        } else {
            out.append({ idx, QString::number(idx), it.toString(), QString(), depth, false, false, true, false, parentCollapsed });
        }
    }
}

QList<FlatTreeRow> buildFlatTreeRows(const QVariantList &raw)
{
    QList<FlatTreeRow> rows;
    flattenTreeVariantList(raw, 0, false, rows);
    int collapsedDepth = -1;
    for (FlatTreeRow &r : rows) {
        if (collapsedDepth >= 0) {
            if (r.depth > collapsedDepth) {
                r.hiddenByAncestor = true;
                continue;
            }
            collapsedDepth = -1;
        }
        if (r.isGroup && r.collapsed)
            collapsedDepth = r.depth;
    }
    return rows;
}

QString readResource(const QString &path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly))
        qFatal("读不到内置的文件 %s", qPrintable(path));
    return QString::fromUtf8(file.readAll());
}

QList<PendingEvent> toPendingList(const QJSValue &array)
{
    QList<PendingEvent> list;
    const int count = array.property(QStringLiteral("length")).toInt();
    for (int i = 0; i < count; ++i) {
        const QJSValue item = array.property(quint32(i));
        if (item.isString()) {
            list.append({ QStringLiteral("event"), item.toString(), QJSValue() });
        } else if (item.isObject()) {
            const QJSValue k = item.property(QStringLiteral("kind"));
            const QString kind = k.isString() ? k.toString() : QStringLiteral("event");
            list.append({ kind, item.property(QStringLiteral("name")).toString(), item.property(QStringLiteral("args")) });
        }
    }
    return list;
}

// 占位用的文字：居中，鼠标事件穿过它落到所在的控件上
QLabel *addPlaceholder(QFrame *frame, const QString &text, QVBoxLayout **layoutOut = nullptr)
{
    auto *layout = new QVBoxLayout(frame);
    layout->setContentsMargins(0, 0, 0, 0);
    auto *label = new QLabel(text, frame);
    label->setAlignment(Qt::AlignCenter);
    label->setAttribute(Qt::WA_TransparentForMouseEvents);
    layout->addWidget(label);
    if (layoutOut)
        *layoutOut = layout;
    return label;
}

} // namespace

struct Ui::Private
{
    explicit Private(Ui *ui) : q(ui) {}

    Ui *q;
    QMainWindow window;
    QJSEngine engine;
    QJSValue api;
    UiEffects effects;
    QList<Control> controls;          // 第 0 个是窗口本身
    QList<QWidget *> dialogs;         // 弹出窗口与模态对话框
    QList<QPair<QString, QAction *>> menuActions;
    QHash<QWidget *, QMenu *> popupMenus;
    QStatusBar *statusBar = nullptr;
    QWidget *statusBarControl = nullptr;
    QHash<QObject *, int> byWidget;
    int pressed = -1;                 // 鼠标左键是在哪个控件上按下的
    bool doubleClick = false;
    bool started = false;             // app.start 触发之前，显示和隐藏不播放效果
    // 界面销毁后，还没放完的效果再回调时靠它知道不能再碰界面
    std::shared_ptr<bool> alive = std::make_shared<bool>(true);

    QJSValue call(const char *function, const QJSValueList &args = {});
    int add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props = {}, int effect = -1);
    int addExternal(const QString &id, QFrame *frame, const QString &text);
    void addMenuAction(const QString &id, QAction *action);
    void addPopupMenu(QWidget *widget, QMenu *menu);
    void rebuildDataForm(const QString &id, QFrame *frame, const QJSValue &props);
    int controlAt(const QPoint &globalPos) const;

    void dispatch(const QString &control, const QString &event, const QJSValue &value = QJSValue());
    void drain(const QJSValue &pending);
    void scheduleTimers();
    void syncStatusBar();
    void onDialogFinished(const QString &id);
    void applyView();
    void setShown(int index, bool shown);
    void clearTransition(int index);
    void finishTransition(int index, int generation);
    void setBusinessState(const QString &path, const QJSValue &value);
    void requestEvent(const QString &name, const QJSValue &args);
    void setExternal(const QString &id, QWidget *widget);

    // 生成的部分，见文件末尾
    void build();
    bool raiseBusinessEvent(const QString &name, const QJSValue &args);
    QAbstractAnimation *createVisibility(int effect, QWidget *target, bool showing);
};

Ui::Ui(QObject *parent)
    : BusinessInterface(parent)
    , d(new Private(this))
{
    // 逻辑：和工具里预览时运行的是同一份代码
    const QJSValue loaded = d->engine.evaluate(readResource(QStringLiteral(":/vf/logic/runtime.js")), QStringLiteral("runtime.js"));
    if (loaded.isError()) {
        qFatal("逻辑脚本加载失败（第 %d 行）：%s", loaded.property(QStringLiteral("lineNumber")).toInt(),
               qPrintable(loaded.toString()));
    }
    d->api = d->engine.globalObject().property(QStringLiteral("VF"));
    d->call("init", { readResource(QStringLiteral(":/vf/logic/project.json")) });

    d->build();
    d->applyView();
}

Ui::~Ui()
{
    *d->alive = false;
    if (d->statusBar)
        d->statusBar->removeEventFilter(this);
    for (const Control &control : d->controls) {
        if (control.widget)
            control.widget->removeEventFilter(this);
    }
    d->byWidget.clear();
    d->dialogs.clear();
    d->menuActions.clear();
    d->controls.clear();
    d->statusBar = nullptr;
    d->statusBarControl = nullptr;
    d->api = QJSValue();
    d->window.hide();
}

void Ui::show()
{
    d->window.show();
    d->syncStatusBar();
    start();
}

void Ui::start()
{
    if (d->started)
        return;
    d->drain(d->call("start"));
    d->started = true;
}

QWidget *Ui::window() const
{
    return &d->window;
}

UiEffects &Ui::effects()
{
    return d->effects;
}

QString Ui::stateDump() const
{
    return d->call("dump").toString();
}

QString Ui::widgetDump() const
{
    QJsonObject all;
    for (int index = 1; index < d->controls.size(); ++index) {
        const Control &control = d->controls.at(index);
        QJsonObject props;
        for (const auto &link : control.props)
            props.insert(link.first, QJsonValue::fromVariant(control.widget->property(link.second.constData())));
        QJsonObject one;
        // 只看这个控件自己的设置，不受外层控件影响
        one.insert(QStringLiteral("enabled"), !control.widget->testAttribute(Qt::WA_ForceDisabled));
        one.insert(QStringLiteral("props"), props);
        one.insert(QStringLiteral("visible"), !control.widget->isHidden());
        all.insert(control.id, one);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

QString Ui::layoutDump() const
{
    QJsonObject all;
    for (int index = 1; index < d->controls.size(); ++index) {
        const Control &control = d->controls.at(index);
        QWidget *w = control.widget;
        if (!w || w->isHidden())
            continue;
        QWidget *topWin = w->window();
        if (topWin && topWin != &d->window && topWin->isHidden())
            continue;
        bool ancestorHidden = false;
        for (QWidget *cur = w; cur && cur != topWin; cur = cur->parentWidget()) {
            if (cur->isHidden()) {
                ancestorHidden = true;
                break;
            }
        }
        if (ancestorHidden)
            continue;
        const QPoint pos = (w == topWin) ? QPoint(0, 0) : w->mapTo(topWin, QPoint(0, 0));
        QJsonObject box;
        box.insert(QStringLiteral("x"), pos.x());
        box.insert(QStringLiteral("y"), pos.y());
        box.insert(QStringLiteral("width"), w->width());
        box.insert(QStringLiteral("height"), w->height());
        all.insert(control.id, box);
    }
    return QString::fromUtf8(QJsonDocument(all).toJson(QJsonDocument::Compact));
}

void Ui::triggerRequest(const QString &name, const QString &jsonArgs)
{
    QJSValue args = d->engine.newObject();
    if (!jsonArgs.isEmpty()) {
        const QJsonObject obj = QJsonDocument::fromJson(jsonArgs.toUtf8()).object();
        args = d->engine.toScriptValue(obj.toVariantMap());
    }
    d->requestEvent(name, args);
}

void Ui::setActionSimulation(const QString &name, const QString &mode, int delayMs)
{
    d->call("setActionSim", { name, mode, delayMs });
}

void Ui::setClock(int ms)
{
    d->drain(d->call("setClock", { ms }));
}

int Ui::clock() const
{
    return d->call("getClock").toInt();
}

void Ui::reorderControl(const QString &id, int from, int to)
{
    if (from == to)
        return;
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("from"), from);
    payload.setProperty(QStringLiteral("to"), to);
    d->dispatch(id, QStringLiteral("reorder"), payload);
}

void Ui::toggleTreeCheck(const QString &id, int row, bool checked)
{
    QString itemId = QString::number(row);
    for (const Control &c : d->controls) {
        if (c.id == id) {
            const QList<FlatTreeRow> rows = buildFlatTreeRows(c.widget->property("vfItems").toList());
            if (row >= 0 && row < rows.size())
                itemId = rows.at(row).id;
            break;
        }
    }
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("index"), row);
    payload.setProperty(QStringLiteral("id"), itemId);
    payload.setProperty(QStringLiteral("checked"), checked);
    d->dispatch(id, QStringLiteral("toggleCheck"), payload);
}

void Ui::toggleTreeCollapse(const QString &id, int row, bool collapsed)
{
    QString itemId = QString::number(row);
    for (const Control &c : d->controls) {
        if (c.id == id) {
            const QList<FlatTreeRow> rows = buildFlatTreeRows(c.widget->property("vfItems").toList());
            if (row >= 0 && row < rows.size())
                itemId = rows.at(row).id;
            break;
        }
    }
    QJSValue payload = d->engine.newObject();
    payload.setProperty(QStringLiteral("index"), row);
    payload.setProperty(QStringLiteral("id"), itemId);
    payload.setProperty(QStringLiteral("collapsed"), collapsed);
    d->dispatch(id, QStringLiteral("toggleCollapse"), payload);
}

void Ui::setDataFormField(const QString &id, const QString &fieldName, const QString &rawValue)
{
    for (const Control &c : d->controls) {
        if (c.id != id)
            continue;
        const QVariantMap schema = c.widget->property("vfSchema").toMap();
        const QVariantList ctrls = schema.value(QStringLiteral("controls")).toList();
        for (const QVariant &cv : ctrls) {
            const QVariantMap cm = cv.toMap();
            if (cm.value(QStringLiteral("name")).toString() != fieldName)
                continue;
            const QString type = cm.value(QStringLiteral("type"), QStringLiteral("slider")).toString();
            const QString hook = cm.value(QStringLiteral("hook")).toString();
            QJSValue payload = d->engine.newObject();
            payload.setProperty(QStringLiteral("name"), fieldName);
            payload.setProperty(QStringLiteral("hook"), hook);
            payload.setProperty(QStringLiteral("type"), type);
            if (type == QLatin1String("slider")) {
                const int minV = cm.value(QStringLiteral("min"), 0).toInt();
                const int maxV = cm.value(QStringLiteral("max"), 100).toInt();
                const int clamped = qBound(minV, rawValue.toInt(), maxV);
                payload.setProperty(QStringLiteral("value"), clamped);
            } else if (type == QLatin1String("check")) {
                const bool b = (rawValue == QLatin1String("true") || rawValue == QLatin1String("1"));
                payload.setProperty(QStringLiteral("value"), b);
            } else if (type == QLatin1String("button") || type == QLatin1String("subwindow")) {
                payload.setProperty(QStringLiteral("value"), true);
            } else {
                payload.setProperty(QStringLiteral("value"), rawValue);
            }
            d->dispatch(id, QStringLiteral("change"), payload);
            return;
        }
    }
}

// ---- 鼠标事件 ----
//
// 和工具里的规则相同：每个控件都有 click、dblclick、mousedown、mouseup、mouseenter、mouseleave；
// 点击类事件只交给鼠标下最里面的那个控件；每次点击之后再触发一次全局事件 window.click。
bool Ui::eventFilter(QObject *watched, QEvent *event)
{
    if (watched == d->statusBar) {
        if (event->type() == QEvent::Resize || event->type() == QEvent::Show || event->type() == QEvent::LayoutRequest)
            d->syncStatusBar();
        return false;
    }

    const int index = d->byWidget.value(watched, -1);
    if (index < 0)
        return false;
    const QString id = d->controls.at(index).id;

    switch (event->type()) {
    case QEvent::Resize:
        if (watched == &d->window)
            d->syncStatusBar();
        break;
    case QEvent::Close:
        if (index > 0 && d->dialogs.contains(d->controls.at(index).widget))
            d->onDialogFinished(id);
        break;
    case QEvent::Enter:
        if (index > 0)
            d->dispatch(id, QStringLiteral("mouseenter"));
        break;
    case QEvent::Leave:
        if (index > 0)
            d->dispatch(id, QStringLiteral("mouseleave"));
        break;
    case QEvent::MouseButtonPress:
    case QEvent::MouseButtonDblClick: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        // 没被里面的控件处理的事件会再传给外层，外层在这里认出“不是点在我自己身上”，不重复处理
        if (mouse->button() != Qt::LeftButton || d->controlAt(mouse->globalPosition().toPoint()) != index)
            break;
        d->pressed = index;
        d->doubleClick = event->type() == QEvent::MouseButtonDblClick;
        if (index > 0)
            d->dispatch(id, QStringLiteral("mousedown"));
        break;
    }
    case QEvent::MouseButtonRelease: {
        auto *mouse = static_cast<QMouseEvent *>(event);
        if (mouse->button() != Qt::LeftButton || d->pressed != index)
            break;
        const int target = d->controlAt(mouse->globalPosition().toPoint());
        const bool doubleClick = d->doubleClick;
        d->pressed = -1;
        d->doubleClick = false;
        if (target > 0)
            d->dispatch(d->controls.at(target).id, QStringLiteral("mouseup"));
        // 在同一个控件上按下又松开，才算一次点击
        if (target == index) {
            if (index > 0)
                d->dispatch(id, QStringLiteral("click"));
            d->dispatch(QString(), QStringLiteral("window.click"));
            if (doubleClick && index > 0)
                d->dispatch(id, QStringLiteral("dblclick"));
            if (index > 0) {
                if (QMenu *pop = d->popupMenus.value(d->controls.at(index).widget, nullptr)) {
                    QWidget *w = d->controls.at(index).widget;
                    pop->popup(w->mapToGlobal(QPoint(0, w->height())));
                }
            }
        }
        break;
    }
    default:
        break;
    }
    return false;
}

// ---- 固定的部分 ----

QJSValue Ui::Private::call(const char *function, const QJSValueList &args)
{
    QJSValue result = api.property(QString::fromLatin1(function)).call(args);
    if (result.isError())
        qWarning("逻辑运行出错（%s）：%s", function, qPrintable(result.toString()));
    return result;
}

int Ui::Private::add(const QString &id, QWidget *widget, QList<QPair<QString, QByteArray>> props, int effect)
{
    Control control;
    control.id = id;
    control.widget = widget;
    control.props = std::move(props);
    control.effect = effect;
    control.designRect = widget->geometry();
    // 对象名就是设计项目里的控件 ID，测试和调试都靠它找控件
    widget->setObjectName(id);
    widget->installEventFilter(q);
    controls.append(control);
    byWidget.insert(widget, int(controls.size()) - 1);

    if (auto *list = qobject_cast<QListWidget *>(widget)) {
        QObject::connect(list->model(), &QAbstractItemModel::rowsMoved, q,
                         [this, id](const QModelIndex &, int start, int, const QModelIndex &, int row) {
                             const int to = row > start ? row - 1 : row;
                             QJSValue payload = engine.newObject();
                             payload.setProperty(QStringLiteral("from"), start);
                             payload.setProperty(QStringLiteral("to"), to);
                             dispatch(id, QStringLiteral("reorder"), payload);
                         });
    } else if (auto *tree = qobject_cast<QTreeWidget *>(widget)) {
        tree->setHeaderHidden(true);
        tree->setIndentation(14);
        QObject::connect(tree, &QTreeWidget::currentItemChanged, q,
                         [this, id, tree](QTreeWidgetItem *current, QTreeWidgetItem *) {
                             if (!current)
                                 return;
                             const int row = current->data(0, Qt::UserRole).toInt();
                             if (tree->property("currentRow").toInt() != row)
                                 tree->setProperty("currentRow", row);
                             dispatch(id, QStringLiteral("change"), row);
                             dispatch(id, QStringLiteral("select"), row);
                         });
    } else if (auto *tabBar = qobject_cast<QTabBar *>(widget)) {
        tabBar->setExpanding(false);
        tabBar->setDrawBase(false);
    }

    return int(controls.size()) - 1;
}

// 外部容器：里面的控件由业务提供，界面不处理它上面的鼠标事件
int Ui::Private::addExternal(const QString &id, QFrame *frame, const QString &text)
{
    Control control;
    control.id = id;
    control.widget = frame;
    frame->setObjectName(id);
    frame->setFrameShape(QFrame::StyledPanel);
    control.placeholder = addPlaceholder(frame, text, &control.hostLayout);
    controls.append(control);
    byWidget.insert(frame, int(controls.size()) - 1);
    return int(controls.size()) - 1;
}

void Ui::Private::addMenuAction(const QString &id, QAction *action)
{
    action->setObjectName(id);
    menuActions.append({ id, action });
    QObject::connect(action, &QAction::triggered, q, [this, id] {
        dispatch(id, QStringLiteral("mousedown"));
        dispatch(id, QStringLiteral("mouseup"));
        dispatch(id, QStringLiteral("click"));
        dispatch(QString(), QStringLiteral("window.click"));
    });
}

void Ui::Private::addPopupMenu(QWidget *widget, QMenu *menu)
{
    popupMenus.insert(widget, menu);
}

void Ui::Private::rebuildDataForm(const QString &id, QFrame *frame, const QJSValue &props)
{
    if (!frame)
        return;
    auto *grid = qobject_cast<QGridLayout *>(frame->layout());
    if (!grid) {
        grid = new QGridLayout(frame);
        grid->setContentsMargins(6, 6, 6, 6);
    }
    while (QLayoutItem *item = grid->takeAt(0)) {
        if (QWidget *w = item->widget())
            w->deleteLater();
        delete item;
    }

    const QVariantMap schema = props.property(QStringLiteral("schema")).toVariant().toMap();
    const QVariantMap values = props.property(QStringLiteral("values")).toVariant().toMap();
    const QVariantList ctrls = schema.value(QStringLiteral("controls")).toList();
    grid->setHorizontalSpacing(schema.value(QStringLiteral("column_spacing"), 8).toInt());
    grid->setVerticalSpacing(schema.value(QStringLiteral("row_spacing"), 6).toInt());

    if (ctrls.isEmpty()) {
        const QString emptyText = props.property(QStringLiteral("emptyText")).toString();
        auto *lbl = new QLabel(emptyText.isEmpty() ? QStringLiteral("当前工具无可调节参数") : emptyText, frame);
        grid->addWidget(lbl, 0, 0);
        return;
    }

    int autoRow = 0;
    for (const QVariant &cv : ctrls) {
        const QVariantMap cm = cv.toMap();
        if (!evalVisibleWhenVariant(cm.value(QStringLiteral("visible_when")), values))
            continue;
        const QString name = cm.value(QStringLiteral("name")).toString();
        const QString type = cm.value(QStringLiteral("type"), QStringLiteral("slider")).toString();
        const QString title = cm.value(QStringLiteral("title"), name).toString();
        const QString hook = cm.value(QStringLiteral("hook")).toString();
        const int row = cm.contains(QStringLiteral("row")) ? cm.value(QStringLiteral("row")).toInt() : autoRow++;
        const int startCol = cm.value(QStringLiteral("start_column"), cm.value(QStringLiteral("column"), 0)).toInt();
        const int endCol = cm.value(QStringLiteral("end_column"), startCol).toInt();
        const int colSpan = qMax(1, endCol - startCol + 1);
        const QVariant curVal = values.contains(name) ? values.value(name) : cm.value(QStringLiteral("value"));

        auto *cell = new QWidget(frame);
        auto *cellLay = new QHBoxLayout(cell);
        cellLay->setContentsMargins(0, 0, 0, 0);
        cellLay->setSpacing(6);

        if (type == QLatin1String("slider")) {
            auto *lbl = new QLabel(title, cell);
            auto *slider = new QSlider(Qt::Horizontal, cell);
            slider->setRange(cm.value(QStringLiteral("min"), 0).toInt(), cm.value(QStringLiteral("max"), 100).toInt());
            slider->setValue(curVal.toInt());
            auto *valLbl = new QLabel(QString::number(slider->value()), cell);
            cellLay->addWidget(lbl);
            cellLay->addWidget(slider, 1);
            cellLay->addWidget(valLbl);
            QObject::connect(slider, &QSlider::valueChanged, q, [this, id, name, hook, type, valLbl](int v) {
                valLbl->setText(QString::number(v));
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else if (type == QLatin1String("list")) {
            auto *lbl = new QLabel(title, cell);
            auto *combo = new QComboBox(cell);
            const QVariant rawOpts = cm.value(QStringLiteral("options"));
            if (rawOpts.typeId() == QMetaType::QVariantList) {
                for (const QVariant &o : rawOpts.toList())
                    combo->addItem(o.toString());
            } else {
                for (const QString &part : rawOpts.toString().split(QLatin1Char(','), Qt::SkipEmptyParts))
                    combo->addItem(part.trimmed());
            }
            const int idx = combo->findText(curVal.toString());
            if (idx >= 0)
                combo->setCurrentIndex(idx);
            cellLay->addWidget(lbl);
            cellLay->addWidget(combo, 1);
            QObject::connect(combo, &QComboBox::currentTextChanged, q, [this, id, name, hook, type](const QString &v) {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else if (type == QLatin1String("check")) {
            auto *cb = new QCheckBox(title, cell);
            cb->setChecked(curVal.toBool());
            cellLay->addWidget(cb);
            QObject::connect(cb, &QCheckBox::toggled, q, [this, id, name, hook, type](bool v) {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), v);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        } else {
            auto *btn = new QPushButton(title, cell);
            cellLay->addWidget(btn);
            QObject::connect(btn, &QPushButton::clicked, q, [this, id, name, hook, type] {
                QJSValue payload = engine.newObject();
                payload.setProperty(QStringLiteral("name"), name);
                payload.setProperty(QStringLiteral("value"), true);
                payload.setProperty(QStringLiteral("hook"), hook);
                payload.setProperty(QStringLiteral("type"), type);
                dispatch(id, QStringLiteral("change"), payload);
            });
        }
        grid->addWidget(cell, row, startCol, 1, colSpan);
    }
    grid->setRowStretch(autoRow + 4, 1);
}

// 某个位置上最里面的那个控件；不在任何控件上（包括窗口之外）时返回 -1，在窗口空白处返回 0。
int Ui::Private::controlAt(const QPoint &globalPos) const
{
    for (int i = dialogs.size() - 1; i >= 0; --i) {
        QWidget *dlg = dialogs.at(i);
        if (!dlg || dlg->isHidden())
            continue;
        const QPoint local = dlg->mapFromGlobal(globalPos);
        if (!dlg->rect().contains(local)) {
            if (dlg->property("modal").toBool())
                return -1;
            continue;
        }
        QWidget *widget = dlg->childAt(local);
        if (!widget)
            widget = dlg;
        while (widget) {
            const int index = byWidget.value(widget, -1);
            if (index >= 0)
                return index;
            widget = widget->parentWidget();
        }
    }
    QWidget *widget = window.childAt(window.mapFromGlobal(globalPos));
    while (widget) {
        const int index = byWidget.value(widget, -1);
        if (index >= 0)
            return index;
        widget = widget->parentWidget();
    }
    return -1;
}

// control 为空表示全局事件
void Ui::Private::dispatch(const QString &control, const QString &event, const QJSValue &value)
{
    const QJSValue target = control.isNull() ? QJSValue(QJSValue::NullValue) : QJSValue(control);
    drain(call("dispatch", { target, event, value }));
}

// 处理逻辑交出来的业务事件与动作请求：业务连接了对应的信号，就发信号，由业务把结果写回来；
// 没有连接，就执行设计项目里写的模拟步骤或动作脚本。模拟步骤可能再引出别的事件，所以是一个队列。
void Ui::Private::drain(const QJSValue &pending)
{
    QList<PendingEvent> queue = toPendingList(pending);
    QApplication::sendPostedEvents();
    queue += toPendingList(call("takePending"));
    for (int guard = 0; !queue.isEmpty() && guard < 200; ++guard) {
        const PendingEvent ev = queue.takeFirst();
        if (!raiseBusinessEvent(ev.name, ev.args)) {
            const char *fn = (ev.kind == QLatin1String("action")) ? "simulateAction" : "simulate";
            queue += toPendingList(call(fn, { ev.name, ev.args }));
            QApplication::sendPostedEvents();
        }
        queue += toPendingList(call("takePending"));
    }
    scheduleTimers();
    applyView();
}

void Ui::Private::scheduleTimers()
{
    const QJSValue timers = call("takeTimers");
    const int count = timers.property(QStringLiteral("length")).toInt();
    for (int i = 0; i < count; ++i) {
        const QJSValue t = timers.property(quint32(i));
        const int id = t.property(QStringLiteral("id")).toInt();
        const int delayMs = t.property(QStringLiteral("delayMs")).toInt();
        QTimer::singleShot(qMax(0, delayMs), q, [this, alive = alive, id] {
            if (*alive)
                drain(call("fireTimer", { id }));
        });
    }
}

void Ui::Private::syncStatusBar()
{
    if (!statusBar || !statusBarControl)
        return;
    const QRect target(0, 0, statusBar->width(), statusBar->height());
    if (statusBarControl->geometry() != target)
        statusBarControl->setGeometry(target);
    if (statusBarControl->layout())
        statusBarControl->layout()->activate();
}

void Ui::Private::onDialogFinished(const QString &id)
{
    for (int i = 1; i < controls.size(); ++i) {
        if (controls.at(i).id == id) {
            if (!controls.at(i).shown)
                return;
            controls[i].shown = false;
            drain(call("closeWindow", { id }));
            return;
        }
    }
}

// 把逻辑算出的可见、可用和属性写到控件上
void Ui::Private::applyView()
{
    const QJSValue views = call("views");
    for (const auto &entry : menuActions) {
        const QJSValue view = views.property(entry.first);
        if (view.isUndefined())
            continue;
        QAction *act = entry.second;
        const QSignalBlocker blocker(act);
        act->setEnabled(view.property(QStringLiteral("enabled")).toBool());
        act->setVisible(view.property(QStringLiteral("visible")).toBool());
        const QJSValue p = view.property(QStringLiteral("props"));
        if (p.hasProperty(QStringLiteral("text")))
            act->setText(p.property(QStringLiteral("text")).toString());
        if (p.hasProperty(QStringLiteral("checked")))
            act->setChecked(p.property(QStringLiteral("checked")).toBool());
    }

    for (int index = 1; index < controls.size(); ++index) {
        const Control &control = controls.at(index);
        const QJSValue view = views.property(control.id);
        control.widget->setEnabled(view.property(QStringLiteral("enabled")).toBool());
        const QJSValue props = view.property(QStringLiteral("props"));
        {
            const QSignalBlocker blocker(control.widget);
            for (const auto &link : control.props) {
                const QJSValue value = props.property(link.first);
                if (value.isUndefined() || value.isNull())
                    continue;
                const QVariant wanted = value.toVariant();
                if (link.second == "vfOptions") {
                    if (auto *combo = qobject_cast<QComboBox *>(control.widget)) {
                        if (combo->property("vfOptions") != wanted) {
                            combo->clear();
                            const QString raw = wanted.toString();
                            for (const QString &part : raw.split(QLatin1Char(','), Qt::SkipEmptyParts))
                                combo->addItem(part.trimmed());
                            const QString curVal = props.property(QStringLiteral("value")).toString();
                            const int idx = combo->findText(curVal);
                            if (idx >= 0)
                                combo->setCurrentIndex(idx);
                        }
                    }
                } else if (link.second == "currentText") {
                    if (auto *combo = qobject_cast<QComboBox *>(control.widget)) {
                        const int idx = combo->findText(wanted.toString());
                        if (idx >= 0 && combo->currentIndex() != idx)
                            combo->setCurrentIndex(idx);
                    }
                } else if (link.second == "vfIcon") {
                    if (auto *btn = qobject_cast<QPushButton *>(control.widget)) {
                        if (btn->property("vfIcon") != wanted) {
                            btn->setIcon(makeVectorIcon(wanted.toString()));
                            btn->setIconSize(QSize(14, 14));
                        }
                    }
                } else if (link.second == "checked") {
                    if (auto *btn = qobject_cast<QPushButton *>(control.widget)) {
                        if (props.property(QStringLiteral("checkable")).toBool())
                            btn->setCheckable(true);
                    }
                } else if (link.second == "vfItems" || link.second == "vfMutedFrom" || link.second == "vfDraggable") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        if (list->property(link.second.constData()) != wanted) {
                            list->clear();
                            const bool checkable = props.property(QStringLiteral("checkable")).toBool();
                            const bool draggable = props.property(QStringLiteral("draggable")).toBool();
                            const QJSValue mfVal = props.property(QStringLiteral("mutedFrom"));
                            const int mutedFrom = mfVal.isNumber() ? mfVal.toInt() : -1;
                            list->setDragDropMode(draggable ? QAbstractItemView::InternalMove : QAbstractItemView::NoDragDrop);
                            list->setDefaultDropAction(Qt::MoveAction);
                            const QVariantList items = props.property(QStringLiteral("items")).toVariant().toList();
                            for (int i = 0; i < items.size(); ++i) {
                                const QVariant &it = items.at(i);
                                QString text;
                                if (it.typeId() == QMetaType::QVariantMap) {
                                    const QVariantMap map = it.toMap();
                                    QString name = map.value(QStringLiteral("name")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("label")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("title")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("text")).toString();
                                    if (name.isEmpty()) name = map.value(QStringLiteral("id")).toString();
                                    const QString badge = map.value(QStringLiteral("badge"),
                                                                    map.value(QStringLiteral("time"),
                                                                              map.value(QStringLiteral("meta")))).toString();
                                    if (checkable) {
                                        const bool vis = map.value(QStringLiteral("visible"), true).toBool();
                                        text = (vis ? QStringLiteral("● ") : QStringLiteral("○ ")) + name;
                                    } else {
                                        text = name;
                                    }
                                    if (!badge.isEmpty())
                                        text += QStringLiteral("  [") + badge + QStringLiteral("]");
                                } else {
                                    text = it.toString();
                                }
                                auto *lwItem = new QListWidgetItem(text);
                                if (mutedFrom >= 0 && i >= mutedFrom)
                                    lwItem->setForeground(QColor(100, 116, 139));
                                list->addItem(lwItem);
                            }
                            const int curRow = props.property(QStringLiteral("value")).toInt();
                            if (curRow >= 0 && curRow < list->count())
                                list->setCurrentRow(curRow);
                        }
                    } else if (auto *tree = qobject_cast<QTreeWidget *>(control.widget)) {
                        if (tree->property(link.second.constData()) != wanted) {
                            tree->clear();
                            const bool checkable = props.property(QStringLiteral("checkable")).toBool();
                            const QList<FlatTreeRow> rows = buildFlatTreeRows(props.property(QStringLiteral("items")).toVariant().toList());
                            const int curRow = props.property(QStringLiteral("value")).toInt();
                            for (const FlatTreeRow &r : rows) {
                                if (r.hiddenByAncestor)
                                    continue;
                                QString prefix = QString(r.depth * 2, QLatin1Char(' '));
                                if (r.isGroup)
                                    prefix += r.collapsed ? QStringLiteral("▸ 📁 ") : QStringLiteral("▾ 📂 ");
                                if (checkable)
                                    prefix += r.checked ? QStringLiteral("● ") : QStringLiteral("○ ");
                                QString label = prefix + r.name;
                                if (!r.kind.isEmpty() && !r.isGroup)
                                    label += QStringLiteral("  [") + r.kind + QStringLiteral("]");
                                auto *twItem = new QTreeWidgetItem(tree, QStringList{ label });
                                twItem->setData(0, Qt::UserRole, r.index);
                                twItem->setData(0, Qt::UserRole + 1, r.id);
                                if (r.index == curRow)
                                    tree->setCurrentItem(twItem);
                            }
                        }
                    }
                } else if (link.second == "currentRow") {
                    if (auto *list = qobject_cast<QListWidget *>(control.widget)) {
                        const int row = wanted.toInt();
                        if (row >= -1 && row < list->count() && list->currentRow() != row)
                            list->setCurrentRow(row);
                    } else if (auto *tree = qobject_cast<QTreeWidget *>(control.widget)) {
                        const int row = wanted.toInt();
                        for (int i = 0; i < tree->topLevelItemCount(); ++i) {
                            QTreeWidgetItem *it = tree->topLevelItem(i);
                            if (it->data(0, Qt::UserRole).toInt() == row) {
                                if (tree->currentItem() != it)
                                    tree->setCurrentItem(it);
                                break;
                            }
                        }
                    }
                } else if (link.second == "vfTabs") {
                    if (auto *tabBar = qobject_cast<QTabBar *>(control.widget)) {
                        if (tabBar->property("vfTabs") != wanted) {
                            while (tabBar->count() > 0)
                                tabBar->removeTab(0);
                            if (wanted.typeId() == QMetaType::QVariantList) {
                                for (const QVariant &it : wanted.toList())
                                    tabBar->addTab(it.toString());
                            } else {
                                for (const QString &part : wanted.toString().split(QLatin1Char(','), Qt::SkipEmptyParts))
                                    tabBar->addTab(part.trimmed());
                            }
                            const int curIdx = props.property(QStringLiteral("value")).toInt();
                            if (curIdx >= 0 && curIdx < tabBar->count())
                                tabBar->setCurrentIndex(curIdx);
                        }
                    }
                } else if (link.second == "currentIndex") {
                    if (auto *tabBar = qobject_cast<QTabBar *>(control.widget)) {
                        const int idx = wanted.toInt();
                        if (idx >= 0 && idx < tabBar->count() && tabBar->currentIndex() != idx)
                            tabBar->setCurrentIndex(idx);
                    }
                } else if (link.second == "vfOrientation") {
                    if (auto *slider = qobject_cast<QAbstractSlider *>(control.widget)) {
                        slider->setOrientation(wanted.toString() == QLatin1String("vertical") ? Qt::Vertical : Qt::Horizontal);
                    } else if (auto *frame = qobject_cast<QFrame *>(control.widget)) {
                        frame->setFrameShape(wanted.toString() == QLatin1String("vertical") ? QFrame::VLine : QFrame::HLine);
                    }
                } else if (link.second == "vfButtons" || link.second == "vfOkText" || link.second == "vfCancelText") {
                    if (auto *bb = qobject_cast<QDialogButtonBox *>(control.widget)) {
                        if (bb->property(link.second.constData()) != wanted) {
                            const QString rawBtns = props.property(QStringLiteral("buttons")).toString();
                            const QStringList parts = (rawBtns.isEmpty() ? QStringLiteral("ok,cancel") : rawBtns)
                                                          .split(QLatin1Char(','), Qt::SkipEmptyParts);
                            QDialogButtonBox::StandardButtons flags = QDialogButtonBox::NoButton;
                            for (const QString &p : parts) {
                                const QString k = p.trimmed().toLower();
                                if (k == QLatin1String("ok")) flags |= QDialogButtonBox::Ok;
                                else if (k == QLatin1String("cancel")) flags |= QDialogButtonBox::Cancel;
                                else if (k == QLatin1String("apply")) flags |= QDialogButtonBox::Apply;
                                else if (k == QLatin1String("close")) flags |= QDialogButtonBox::Close;
                            }
                            bb->setStandardButtons(flags);
                            if (QPushButton *okBtn = bb->button(QDialogButtonBox::Ok)) {
                                const QString okT = props.property(QStringLiteral("okText")).toString();
                                okBtn->setText(okT.isEmpty() ? QStringLiteral("确定") : okT);
                            }
                            if (QPushButton *cancelBtn = bb->button(QDialogButtonBox::Cancel)) {
                                const QString cancelT = props.property(QStringLiteral("cancelText")).toString();
                                cancelBtn->setText(cancelT.isEmpty() ? QStringLiteral("取消") : cancelT);
                            }
                        }
                    }
                } else if (link.second == "vfSchema" || link.second == "vfValues" || link.second == "vfEmptyText") {
                    if (auto *frame = qobject_cast<QFrame *>(control.widget);
                        frame && !qobject_cast<QAbstractScrollArea *>(control.widget)) {
                        if (frame->property(link.second.constData()) != wanted)
                            rebuildDataForm(control.id, frame, props);
                    }
                } else if (link.second == "plainText") {
                    if (auto *edit = qobject_cast<QPlainTextEdit *>(control.widget)) {
                        if (edit->toPlainText() != wanted.toString())
                            edit->setPlainText(wanted.toString());
                    }
                } else if (link.second == "vfAlign") {
                    if (auto *label = qobject_cast<QLabel *>(control.widget)) {
                        const QString align = wanted.toString();
                        if (align == QLatin1String("center"))
                            label->setAlignment(Qt::AlignCenter);
                        else if (align == QLatin1String("right"))
                            label->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
                        else
                            label->setAlignment(Qt::AlignLeft | Qt::AlignVCenter);
                    }
                } else if (link.second == "windowTitle") {
                    if (auto *dock = qobject_cast<QDockWidget *>(control.widget)) {
                        if (auto *hdr = qobject_cast<QLabel *>(dock->titleBarWidget()))
                            hdr->setText(wanted.toString());
                    }
                }
                // 值没变就不写，免得输入框的光标被重置
                if (control.widget->property(link.second.constData()) != wanted)
                    control.widget->setProperty(link.second.constData(), wanted);
            }
        }
        setShown(index, view.property(QStringLiteral("visible")).toBool());
        if (control.widget->layout()) {
            control.widget->layout()->invalidate();
            control.widget->layout()->activate();
        }
    }
    QApplication::sendPostedEvents(nullptr, QEvent::LayoutRequest);
}

// 显示或隐藏一个控件。指定了效果、并且有人提供了实现时，带着过渡动画做：
// 显示是先显示再跑动画，隐藏是动画跑完再隐藏；中途又变了，旧的那次作废。
//
// 效果的实现只负责创建动画。启动、收尾、把控件定到最终状态，都在这里做，
// 所以效果的实现写漏了什么，控件也一定会到达最终的显示或隐藏状态。
void Ui::Private::setShown(int index, bool shown)
{
    Control &control = controls[index];
    if (control.shown == shown)
        return;
    control.shown = shown;
    const int generation = ++control.generation;
    // 上一次过渡还没跑完：停掉它，控件恢复原样，再开始这一次
    clearTransition(index);
    QWidget *widget = control.widget;
    if (!started || control.effect < 0) {
        widget->setVisible(shown);
        if (shown && widget->layout())
            widget->layout()->activate();
        return;
    }

    widget->setVisible(true);
    control.transitioning = true;
    QAbstractAnimation *animation = createVisibility(control.effect, widget, shown);
    if (!animation) {
        // 没有人提供实现，或者实现说没有动画可做：直接到最终状态
        finishTransition(index, generation);
        return;
    }
    control.transition = animation;
    auto finish = [this, alive = alive, index, generation] {
        if (*alive)
            finishTransition(index, generation);
    };
    QObject::connect(animation, &QAbstractAnimation::finished, q, finish);

    // 兜底：动画没有按时结束（比如被暂停了、被别处删掉了），到点也照样收尾
    const int duration = animation->totalDuration();
    if (duration < 0) {
        qWarning("控件 %s 的过渡动画没有结束时间（循环个不停），已跳过过渡", qPrintable(control.id));
        finishTransition(index, generation);
        return;
    }
    QTimer::singleShot(duration + kTransitionGraceMs, q, finish);
    if (animation->state() == QAbstractAnimation::Stopped)
        animation->start();
}

// 停掉并删除还在跑的过渡动画，把控件的位置、大小恢复原样，清掉动画加在控件上的图形效果。
void Ui::Private::clearTransition(int index)
{
    Control &control = controls[index];
    if (!control.transitioning)
        return;
    control.transitioning = false;
    if (QAbstractAnimation *animation = control.transition) {
        control.transition = nullptr;
        animation->stop();
        animation->deleteLater();
    }
    control.widget->setGeometry(control.designRect);
    control.widget->setGraphicsEffect(nullptr);
}

// 一次过渡结束：动画跑完、没有动画、超时，都走这里。已经被后来的一次取代的，不做任何事。
void Ui::Private::finishTransition(int index, int generation)
{
    Control &control = controls[index];
    if (control.generation != generation || !control.transitioning)
        return;
    // 先定到最终的显示或隐藏状态，再恢复大小，免得收起之后完整的面板闪一下
    control.widget->setVisible(control.shown);
    clearTransition(index);
}

void Ui::Private::setBusinessState(const QString &path, const QJSValue &value)
{
    const QJSValue problem = call("setState", { path, value });
    if (problem.isString())
        qWarning("业务写回状态失败：%s", qPrintable(problem.toString()));
    applyView();
}

void Ui::Private::requestEvent(const QString &name, const QJSValue &args)
{
    drain(call("request", { name, args }));
}

void Ui::Private::setExternal(const QString &id, QWidget *widget)
{
    for (Control &control : controls) {
        if (control.id != id || !control.hostLayout)
            continue;
        if (control.hosted && control.hosted != widget) {
            // 原来放着的控件交还给业务，不删除
            control.hostLayout->removeWidget(control.hosted);
            control.hosted->setParent(nullptr);
        }
        control.hosted = widget;
        control.placeholder->setVisible(widget == nullptr);
        if (widget)
            control.hostLayout->addWidget(widget);
        return;
    }
}

// ---- 生成的部分 ----

// 控件树、分区、停靠面板和排版。每个控件的对象名就是它在设计项目里的 ID。
void Ui::Private::build()
{
    QApplication::setStyle(QStringLiteral("Fusion"));
    window.setWindowTitle(QStringLiteral("AnimeAn 动画工作台"));
    window.resize(1280, 800);
    window.setAnimated(false);
    window.setStyleSheet(QStringLiteral("QMainWindow::separator { width: 0px; height: 0px; border: none; }"));
    window.setCorner(Qt::TopLeftCorner, Qt::TopDockWidgetArea);
    window.setCorner(Qt::TopRightCorner, Qt::TopDockWidgetArea);
    window.setCorner(Qt::BottomLeftCorner, Qt::BottomDockWidgetArea);
    window.setCorner(Qt::BottomRightCorner, Qt::BottomDockWidgetArea);
    add(QStringLiteral("window"), &window);

    // 菜单栏
    auto *menuBar = window.menuBar();
    menuBar->setNativeMenuBar(false);
    menuBar->setFixedHeight(28);
    auto *menu_fileMenu = menuBar->addMenu(QStringLiteral("文件"));
    auto *act_menuNewProject = menu_fileMenu->addAction(QStringLiteral("新建项目..."));
    act_menuNewProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+N")));
    addMenuAction(QStringLiteral("menuNewProject"), act_menuNewProject);
    auto *act_menuOpenProject = menu_fileMenu->addAction(QStringLiteral("打开项目..."));
    act_menuOpenProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+O")));
    addMenuAction(QStringLiteral("menuOpenProject"), act_menuOpenProject);
    auto *act_menuSaveProject = menu_fileMenu->addAction(QStringLiteral("保存项目"));
    act_menuSaveProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+S")));
    addMenuAction(QStringLiteral("menuSaveProject"), act_menuSaveProject);
    auto *act_menuSaveAsProject = menu_fileMenu->addAction(QStringLiteral("另存为..."));
    act_menuSaveAsProject->setShortcut(QKeySequence(QStringLiteral("Ctrl+Shift+S")));
    addMenuAction(QStringLiteral("menuSaveAsProject"), act_menuSaveAsProject);
    auto *sub_menuExportSub = menu_fileMenu->addMenu(QStringLiteral("导入与导出"));
    addMenuAction(QStringLiteral("menuExportSub"), sub_menuExportSub->menuAction());
    auto *act_menuImportImage = sub_menuExportSub->addAction(QStringLiteral("导入图像素材..."));
    act_menuImportImage->setShortcut(QKeySequence(QStringLiteral("Ctrl+I")));
    addMenuAction(QStringLiteral("menuImportImage"), act_menuImportImage);
    auto *act_menuExportClip = sub_menuExportSub->addAction(QStringLiteral("导出视频片段..."));
    act_menuExportClip->setShortcut(QKeySequence(QStringLiteral("Ctrl+E")));
    addMenuAction(QStringLiteral("menuExportClip"), act_menuExportClip);
    auto *menu_viewMenu = menuBar->addMenu(QStringLiteral("视图"));
    auto *act_menuToggleTools = menu_viewMenu->addAction(QStringLiteral("工具栏"));
    act_menuToggleTools->setCheckable(true);
    act_menuToggleTools->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTools"), act_menuToggleTools);
    auto *act_menuToggleLayers = menu_viewMenu->addAction(QStringLiteral("图层与素材面板"));
    act_menuToggleLayers->setCheckable(true);
    act_menuToggleLayers->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleLayers"), act_menuToggleLayers);
    auto *act_menuToggleInspector = menu_viewMenu->addAction(QStringLiteral("选项与检查器面板"));
    act_menuToggleInspector->setCheckable(true);
    act_menuToggleInspector->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleInspector"), act_menuToggleInspector);
    auto *act_menuToggleTimeline = menu_viewMenu->addAction(QStringLiteral("时间轴面板"));
    act_menuToggleTimeline->setCheckable(true);
    act_menuToggleTimeline->setChecked(true);
    addMenuAction(QStringLiteral("menuToggleTimeline"), act_menuToggleTimeline);
    auto *act_menuOnionSkinToggle = menu_viewMenu->addAction(QStringLiteral("洋葱皮透视"));
    act_menuOnionSkinToggle->setCheckable(true);
    act_menuOnionSkinToggle->setChecked(false);
    act_menuOnionSkinToggle->setShortcut(QKeySequence(QStringLiteral("O")));
    addMenuAction(QStringLiteral("menuOnionSkinToggle"), act_menuOnionSkinToggle);
    auto *act_menuResetLayout = menu_viewMenu->addAction(QStringLiteral("重置工作区布局"));
    addMenuAction(QStringLiteral("menuResetLayout"), act_menuResetLayout);
    auto *menu_editMenu = menuBar->addMenu(QStringLiteral("编辑"));
    auto *act_menuUndo = menu_editMenu->addAction(QStringLiteral("撤销"));
    act_menuUndo->setShortcut(QKeySequence(QStringLiteral("Ctrl+Z")));
    addMenuAction(QStringLiteral("menuUndo"), act_menuUndo);
    auto *act_menuRedo = menu_editMenu->addAction(QStringLiteral("重做"));
    act_menuRedo->setShortcut(QKeySequence(QStringLiteral("Ctrl+Y")));
    addMenuAction(QStringLiteral("menuRedo"), act_menuRedo);
    auto *act_menuClearFrame = menu_editMenu->addAction(QStringLiteral("清空当前帧"));
    act_menuClearFrame->setShortcut(QKeySequence(QStringLiteral("Del")));
    addMenuAction(QStringLiteral("menuClearFrame"), act_menuClearFrame);
    auto *menu_autoMappingMenu = menuBar->addMenu(QStringLiteral("自动映射"));
    auto *act_menuAutoColorize = menu_autoMappingMenu->addAction(QStringLiteral("一键自动上色"));
    act_menuAutoColorize->setShortcut(QKeySequence(QStringLiteral("Alt+C")));
    addMenuAction(QStringLiteral("menuAutoColorize"), act_menuAutoColorize);
    auto *act_menuAutoInbetween = menu_autoMappingMenu->addAction(QStringLiteral("生成中间帧补间"));
    act_menuAutoInbetween->setShortcut(QKeySequence(QStringLiteral("Alt+I")));
    addMenuAction(QStringLiteral("menuAutoInbetween"), act_menuAutoInbetween);
    auto *act_menuTextureSync = menu_autoMappingMenu->addAction(QStringLiteral("同步纹理映射"));
    addMenuAction(QStringLiteral("menuTextureSync"), act_menuTextureSync);
    auto *menu_drawMenu = menuBar->addMenu(QStringLiteral("绘图设置"));
    auto *act_menuDrawSettings = menu_drawMenu->addAction(QStringLiteral("画笔与压感设置..."));
    act_menuDrawSettings->setShortcut(QKeySequence(QStringLiteral("F5")));
    addMenuAction(QStringLiteral("menuDrawSettings"), act_menuDrawSettings);
    auto *sub_menuStabilizerSub = menu_drawMenu->addMenu(QStringLiteral("抖动修正等级"));
    addMenuAction(QStringLiteral("menuStabilizerSub"), sub_menuStabilizerSub->menuAction());
    auto *act_menuStabOff = sub_menuStabilizerSub->addAction(QStringLiteral("关闭修正 (S0)"));
    act_menuStabOff->setCheckable(true);
    act_menuStabOff->setChecked(false);
    auto *grp_stabilizerGroup = new QActionGroup(&window);
    grp_stabilizerGroup->setExclusive(true);
    grp_stabilizerGroup->addAction(act_menuStabOff);
    addMenuAction(QStringLiteral("menuStabOff"), act_menuStabOff);
    auto *act_menuStabMed = sub_menuStabilizerSub->addAction(QStringLiteral("标准修正 (S5)"));
    act_menuStabMed->setCheckable(true);
    act_menuStabMed->setChecked(true);
    grp_stabilizerGroup->addAction(act_menuStabMed);
    addMenuAction(QStringLiteral("menuStabMed"), act_menuStabMed);
    auto *act_menuStabHigh = sub_menuStabilizerSub->addAction(QStringLiteral("强力平滑 (S12)"));
    act_menuStabHigh->setCheckable(true);
    act_menuStabHigh->setChecked(false);
    grp_stabilizerGroup->addAction(act_menuStabHigh);
    addMenuAction(QStringLiteral("menuStabHigh"), act_menuStabHigh);
    auto *menu_themeMenu = menuBar->addMenu(QStringLiteral("主题"));
    auto *act_menuThemeDark = menu_themeMenu->addAction(QStringLiteral("深色创作主题"));
    act_menuThemeDark->setCheckable(true);
    act_menuThemeDark->setChecked(true);
    auto *grp_themeGroup = new QActionGroup(&window);
    grp_themeGroup->setExclusive(true);
    grp_themeGroup->addAction(act_menuThemeDark);
    addMenuAction(QStringLiteral("menuThemeDark"), act_menuThemeDark);
    auto *act_menuThemeGraphite = menu_themeMenu->addAction(QStringLiteral("石墨灰护眼主题"));
    act_menuThemeGraphite->setCheckable(true);
    act_menuThemeGraphite->setChecked(false);
    grp_themeGroup->addAction(act_menuThemeGraphite);
    addMenuAction(QStringLiteral("menuThemeGraphite"), act_menuThemeGraphite);
    auto *act_menuThemeLight = menu_themeMenu->addAction(QStringLiteral("明亮浅色主题"));
    act_menuThemeLight->setCheckable(true);
    act_menuThemeLight->setChecked(false);
    grp_themeGroup->addAction(act_menuThemeLight);
    addMenuAction(QStringLiteral("menuThemeLight"), act_menuThemeLight);

    // toolsDock：停靠面板（top）
    auto *w_toolsDock = new QDockWidget(QStringLiteral("工具栏"), &window);
    w_toolsDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_toolsDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_toolsDock = new QLabel(QStringLiteral("工具栏"), w_toolsDock);
    hdr_w_toolsDock->setFixedHeight(26);
    w_toolsDock->setTitleBarWidget(hdr_w_toolsDock);
    auto *body_w_toolsDock = new QWidget(w_toolsDock);
    w_toolsDock->setWidget(body_w_toolsDock);
    w_toolsDock->setFixedHeight(64);
    window.addDockWidget(Qt::TopDockWidgetArea, w_toolsDock);
    add(QStringLiteral("toolsDock"), w_toolsDock, { { QStringLiteral("title"), "windowTitle" } });

    // newProjectBtn：Button
    auto *w_newProjectBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("newProjectBtn"), w_newProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_newProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("newProjectBtn"), QStringLiteral("toggle"), value);
    });

    // toolbarSep1：Separator
    auto *w_toolbarSep1 = new QFrame(body_w_toolsDock);
    w_toolbarSep1->setProperty("frameShape", 4);
    w_toolbarSep1->setProperty("frameShadow", 48);
    add(QStringLiteral("toolbarSep1"), w_toolbarSep1, { { QStringLiteral("orientation"), "vfOrientation" } });

    // toolBrushBtn：Button
    auto *w_toolBrushBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolBrushBtn"), w_toolBrushBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolBrushBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolBrushBtn"), QStringLiteral("toggle"), value);
    });

    // toolEraserBtn：Button
    auto *w_toolEraserBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolEraserBtn"), w_toolEraserBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolEraserBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolEraserBtn"), QStringLiteral("toggle"), value);
    });

    // toolFillBtn：Button
    auto *w_toolFillBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolFillBtn"), w_toolFillBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolFillBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolFillBtn"), QStringLiteral("toggle"), value);
    });

    // toolShapeBtn：Button
    auto *w_toolShapeBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolShapeBtn"), w_toolShapeBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolShapeBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolShapeBtn"), QStringLiteral("toggle"), value);
    });

    // toolSelectBtn：Button
    auto *w_toolSelectBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolSelectBtn"), w_toolSelectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolSelectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolSelectBtn"), QStringLiteral("toggle"), value);
    });

    // toolMoveBtn：Button
    auto *w_toolMoveBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolMoveBtn"), w_toolMoveBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolMoveBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolMoveBtn"), QStringLiteral("toggle"), value);
    });

    // toolEyedropperBtn：Button
    auto *w_toolEyedropperBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolEyedropperBtn"), w_toolEyedropperBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toolEyedropperBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolEyedropperBtn"), QStringLiteral("toggle"), value);
    });

    // toolbarSep2：Separator
    auto *w_toolbarSep2 = new QFrame(body_w_toolsDock);
    w_toolbarSep2->setProperty("frameShape", 4);
    w_toolbarSep2->setProperty("frameShadow", 48);
    add(QStringLiteral("toolbarSep2"), w_toolbarSep2, { { QStringLiteral("orientation"), "vfOrientation" } });

    // toolMoreMenuBtn：Button
    auto *w_toolMoreMenuBtn = new QPushButton(body_w_toolsDock);
    add(QStringLiteral("toolMoreMenuBtn"), w_toolMoreMenuBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    auto *pop_w_toolMoreMenuBtn = new QMenu(w_toolMoreMenuBtn);
    auto *act_popupResetTool = pop_w_toolMoreMenuBtn->addAction(QStringLiteral("重置当前工具参数"));
    addMenuAction(QStringLiteral("popupResetTool"), act_popupResetTool);
    auto *act_popupOpenDrawSettings = pop_w_toolMoreMenuBtn->addAction(QStringLiteral("打开压感设置..."));
    addMenuAction(QStringLiteral("popupOpenDrawSettings"), act_popupOpenDrawSettings);
    addPopupMenu(w_toolMoreMenuBtn, pop_w_toolMoreMenuBtn);
    QObject::connect(w_toolMoreMenuBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toolMoreMenuBtn"), QStringLiteral("toggle"), value);
    });

    // toolbarSpacer：Spacer
    auto *w_toolbarSpacer = new QWidget(body_w_toolsDock);
    add(QStringLiteral("toolbarSpacer"), w_toolbarSpacer, { { QStringLiteral("orientation"), "vfOrientation" } });

    // projectSummaryLabel：Label
    auto *w_projectSummaryLabel = new QLabel(body_w_toolsDock);
    w_projectSummaryLabel->setProperty("wordWrap", true);
    add(QStringLiteral("projectSummaryLabel"), w_projectSummaryLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // layersDock：停靠面板（left）
    auto *w_layersDock = new QDockWidget(QStringLiteral("图层与素材"), &window);
    w_layersDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_layersDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_layersDock = new QLabel(QStringLiteral("图层与素材"), w_layersDock);
    hdr_w_layersDock->setFixedHeight(26);
    w_layersDock->setTitleBarWidget(hdr_w_layersDock);
    auto *body_w_layersDock = new QWidget(w_layersDock);
    w_layersDock->setWidget(body_w_layersDock);
    w_layersDock->setFixedWidth(260);
    window.addDockWidget(Qt::LeftDockWidgetArea, w_layersDock);
    add(QStringLiteral("layersDock"), w_layersDock, { { QStringLiteral("title"), "windowTitle" } });

    // layerToolbar：容器
    auto *w_layerToolbar = new QFrame(body_w_layersDock);
    w_layerToolbar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerToolbar"), w_layerToolbar);

    // addLayerBtn：Button
    auto *w_addLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("addLayerBtn"), w_addLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addLayerBtn"), QStringLiteral("toggle"), value);
    });

    // addGroupBtn：Button
    auto *w_addGroupBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("addGroupBtn"), w_addGroupBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addGroupBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addGroupBtn"), QStringLiteral("toggle"), value);
    });

    // removeLayerBtn：Button
    auto *w_removeLayerBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("removeLayerBtn"), w_removeLayerBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeLayerBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeLayerBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerUpBtn：Button
    auto *w_moveLayerUpBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerUpBtn"), w_moveLayerUpBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerUpBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerUpBtn"), QStringLiteral("toggle"), value);
    });

    // moveLayerDownBtn：Button
    auto *w_moveLayerDownBtn = new QPushButton(w_layerToolbar);
    add(QStringLiteral("moveLayerDownBtn"), w_moveLayerDownBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_moveLayerDownBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("moveLayerDownBtn"), QStringLiteral("toggle"), value);
    });

    // layerTree：Tree
    auto *w_layerTree = new QTreeWidget(body_w_layersDock);
    add(QStringLiteral("layerTree"), w_layerTree, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("checkable"), "vfCheckable" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("emptyText"), "vfEmptyText" } });
    auto *ctx_w_layerTree = new QMenu(w_layerTree);
    auto *act_ctxDuplicateLayer = ctx_w_layerTree->addAction(QStringLiteral("复制选中图层"));
    addMenuAction(QStringLiteral("ctxDuplicateLayer"), act_ctxDuplicateLayer);
    auto *act_ctxToggleLockLayer = ctx_w_layerTree->addAction(QStringLiteral("切换图层锁定"));
    addMenuAction(QStringLiteral("ctxToggleLockLayer"), act_ctxToggleLockLayer);
    auto *act_ctxDeleteLayer = ctx_w_layerTree->addAction(QStringLiteral("删除选中图层"));
    addMenuAction(QStringLiteral("ctxDeleteLayer"), act_ctxDeleteLayer);
    w_layerTree->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(w_layerTree, &QWidget::customContextMenuRequested, q, [w_layerTree, ctx_w_layerTree](const QPoint &pos) {
        ctx_w_layerTree->popup(w_layerTree->mapToGlobal(pos));
    });

    // layerList：List
    auto *w_layerList = new QListWidget(body_w_layersDock);
    add(QStringLiteral("layerList"), w_layerList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("mutedFrom"), "vfMutedFrom" } });
    QObject::connect(w_layerList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("layerList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_layerList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("layerList"), QStringLiteral("select"), value);
    });

    // layerVisibilityBar：容器
    auto *w_layerVisibilityBar = new QFrame(body_w_layersDock);
    w_layerVisibilityBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerVisibilityBar"), w_layerVisibilityBar);

    // layerVisibleLabel：Label
    auto *w_layerVisibleLabel = new QLabel(w_layerVisibilityBar);
    w_layerVisibleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("layerVisibleLabel"), w_layerVisibleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // toggleVisibleBtn：Button
    auto *w_toggleVisibleBtn = new QPushButton(w_layerVisibilityBar);
    add(QStringLiteral("toggleVisibleBtn"), w_toggleVisibleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_toggleVisibleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("toggleVisibleBtn"), QStringLiteral("toggle"), value);
    });

    // assetsPanelSep：Separator
    auto *w_assetsPanelSep = new QFrame(body_w_layersDock);
    w_assetsPanelSep->setProperty("frameShape", 4);
    w_assetsPanelSep->setProperty("frameShadow", 48);
    add(QStringLiteral("assetsPanelSep"), w_assetsPanelSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // assetsHeaderBar：容器
    auto *w_assetsHeaderBar = new QFrame(body_w_layersDock);
    w_assetsHeaderBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("assetsHeaderBar"), w_assetsHeaderBar);

    // assetsTitleLabel：Label
    auto *w_assetsTitleLabel = new QLabel(w_assetsHeaderBar);
    w_assetsTitleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("assetsTitleLabel"), w_assetsTitleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // addAssetBtn：Button
    auto *w_addAssetBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("addAssetBtn"), w_addAssetBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addAssetBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addAssetBtn"), QStringLiteral("toggle"), value);
    });

    // removeAssetBtn：Button
    auto *w_removeAssetBtn = new QPushButton(w_assetsHeaderBar);
    add(QStringLiteral("removeAssetBtn"), w_removeAssetBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeAssetBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeAssetBtn"), QStringLiteral("toggle"), value);
    });

    // assetList：List
    auto *w_assetList = new QListWidget(body_w_layersDock);
    add(QStringLiteral("assetList"), w_assetList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("mutedFrom"), "vfMutedFrom" } });
    QObject::connect(w_assetList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("assetList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_assetList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("assetList"), QStringLiteral("select"), value);
    });

    // assetNoteInput：TextArea
    auto *w_assetNoteInput = new QPlainTextEdit(body_w_layersDock);
    add(QStringLiteral("assetNoteInput"), w_assetNoteInput, { { QStringLiteral("placeholder"), "placeholderText" }, { QStringLiteral("value"), "plainText" }, { QStringLiteral("readOnly"), "readOnly" } });
    QObject::connect(w_assetNoteInput, &QPlainTextEdit::textChanged, q, [this, w_assetNoteInput] {
        dispatch(QStringLiteral("assetNoteInput"), QStringLiteral("change"), w_assetNoteInput->toPlainText());
    });

    // centralArea：容器
    auto *w_centralArea = new QFrame(&window);
    window.setCentralWidget(w_centralArea);
    w_centralArea->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("centralArea"), w_centralArea);

    // canvasHeader：容器
    auto *w_canvasHeader = new QFrame(w_centralArea);
    w_canvasHeader->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("canvasHeader"), w_canvasHeader);

    // workspaceTabBar：TabBar
    auto *w_workspaceTabBar = new QTabBar(w_canvasHeader);
    add(QStringLiteral("workspaceTabBar"), w_workspaceTabBar, { { QStringLiteral("tabs"), "vfTabs" }, { QStringLiteral("value"), "currentIndex" } });
    QObject::connect(w_workspaceTabBar, &QTabBar::currentChanged, q, [this](double value) {
        dispatch(QStringLiteral("workspaceTabBar"), QStringLiteral("change"), value);
    });

    // canvasTitleLabel：Label
    auto *w_canvasTitleLabel = new QLabel(w_canvasHeader);
    w_canvasTitleLabel->setProperty("wordWrap", true);
    add(QStringLiteral("canvasTitleLabel"), w_canvasTitleLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // zoomSlider：Slider
    auto *w_zoomSlider = new QSlider(w_canvasHeader);
    add(QStringLiteral("zoomSlider"), w_zoomSlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_zoomSlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("zoomSlider"), QStringLiteral("change"), value);
    });

    // activeToolLabel：Label
    auto *w_activeToolLabel = new QLabel(w_canvasHeader);
    w_activeToolLabel->setProperty("wordWrap", true);
    add(QStringLiteral("activeToolLabel"), w_activeToolLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // canvasHost：外部容器
    auto *w_canvasHost = new QFrame(w_centralArea);
    addExternal(QStringLiteral("canvasHost"), w_canvasHost, QStringLiteral("外部容器 canvasHost\n（业务还没有放入控件）"));
    w_canvasHost->setFrameShape(QFrame::NoFrame);
    auto *ctx_w_canvasHost = new QMenu(w_canvasHost);
    auto *act_ctxResetZoom = ctx_w_canvasHost->addAction(QStringLiteral("重置画布缩放 (100%)"));
    addMenuAction(QStringLiteral("ctxResetZoom"), act_ctxResetZoom);
    auto *act_ctxClearCanvas = ctx_w_canvasHost->addAction(QStringLiteral("清空当前帧画布"));
    addMenuAction(QStringLiteral("ctxClearCanvas"), act_ctxClearCanvas);
    w_canvasHost->setContextMenuPolicy(Qt::CustomContextMenu);
    QObject::connect(w_canvasHost, &QWidget::customContextMenuRequested, q, [w_canvasHost, ctx_w_canvasHost](const QPoint &pos) {
        ctx_w_canvasHost->popup(w_canvasHost->mapToGlobal(pos));
    });

    // inspectorDock：停靠面板（right）
    auto *w_inspectorDock = new QDockWidget(QStringLiteral("工具选项与检查器"), &window);
    w_inspectorDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_inspectorDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_inspectorDock = new QLabel(QStringLiteral("工具选项与检查器"), w_inspectorDock);
    hdr_w_inspectorDock->setFixedHeight(26);
    w_inspectorDock->setTitleBarWidget(hdr_w_inspectorDock);
    auto *body_w_inspectorDock = new QWidget(w_inspectorDock);
    w_inspectorDock->setWidget(body_w_inspectorDock);
    w_inspectorDock->setFixedWidth(296);
    window.addDockWidget(Qt::RightDockWidgetArea, w_inspectorDock);
    add(QStringLiteral("inspectorDock"), w_inspectorDock, { { QStringLiteral("title"), "windowTitle" } });

    // toolOptHeader：Label
    auto *w_toolOptHeader = new QLabel(body_w_inspectorDock);
    w_toolOptHeader->setProperty("wordWrap", true);
    add(QStringLiteral("toolOptHeader"), w_toolOptHeader, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // toolOptionsForm：DataForm
    auto *w_toolOptionsForm = new QFrame(body_w_inspectorDock);
    add(QStringLiteral("toolOptionsForm"), w_toolOptionsForm, { { QStringLiteral("schema"), "vfSchema" }, { QStringLiteral("values"), "vfValues" }, { QStringLiteral("emptyText"), "vfEmptyText" } });

    // inspectorSep1：Separator
    auto *w_inspectorSep1 = new QFrame(body_w_inspectorDock);
    w_inspectorSep1->setProperty("frameShape", 4);
    w_inspectorSep1->setProperty("frameShadow", 48);
    add(QStringLiteral("inspectorSep1"), w_inspectorSep1, { { QStringLiteral("orientation"), "vfOrientation" } });

    // inspectorTabs：容器
    auto *w_inspectorTabs = new QFrame(body_w_inspectorDock);
    w_inspectorTabs->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("inspectorTabs"), w_inspectorTabs);

    // tabPropsBtn：Button
    auto *w_tabPropsBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabPropsBtn"), w_tabPropsBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabPropsBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabPropsBtn"), QStringLiteral("toggle"), value);
    });

    // tabHistoryBtn：Button
    auto *w_tabHistoryBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabHistoryBtn"), w_tabHistoryBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabHistoryBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabHistoryBtn"), QStringLiteral("toggle"), value);
    });

    // tabExportBtn：Button
    auto *w_tabExportBtn = new QPushButton(w_inspectorTabs);
    add(QStringLiteral("tabExportBtn"), w_tabExportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_tabExportBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("tabExportBtn"), QStringLiteral("toggle"), value);
    });

    // inspectorStack：容器
    auto *w_inspectorStack = new QFrame(body_w_inspectorDock);
    w_inspectorStack->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("inspectorStack"), w_inspectorStack);

    // layerPropsPage：容器
    auto *w_layerPropsPage = new QFrame(w_inspectorStack);
    w_layerPropsPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("layerPropsPage"), w_layerPropsPage);

    // blendLabel：Label
    auto *w_blendLabel = new QLabel(w_layerPropsPage);
    w_blendLabel->setProperty("wordWrap", true);
    add(QStringLiteral("blendLabel"), w_blendLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // blendCombo：ComboBox
    auto *w_blendCombo = new QComboBox(w_layerPropsPage);
    add(QStringLiteral("blendCombo"), w_blendCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_blendCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("blendCombo"), QStringLiteral("change"), value);
    });

    // opacityLabel：Label
    auto *w_opacityLabel = new QLabel(w_layerPropsPage);
    w_opacityLabel->setProperty("wordWrap", true);
    add(QStringLiteral("opacityLabel"), w_opacityLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // opacitySpin：SpinBox
    auto *w_opacitySpin = new QSpinBox(w_layerPropsPage);
    add(QStringLiteral("opacitySpin"), w_opacitySpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_opacitySpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("opacitySpin"), QStringLiteral("change"), value);
    });

    // lockLabel：Label
    auto *w_lockLabel = new QLabel(w_layerPropsPage);
    w_lockLabel->setProperty("wordWrap", true);
    add(QStringLiteral("lockLabel"), w_lockLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // lockLayerCheck：CheckBox
    auto *w_lockLayerCheck = new QCheckBox(w_layerPropsPage);
    add(QStringLiteral("lockLayerCheck"), w_lockLayerCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_lockLayerCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("lockLayerCheck"), QStringLiteral("change"), value);
    });

    // exportPage：容器
    auto *w_exportPage = new QFrame(w_inspectorStack);
    w_exportPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("exportPage"), w_exportPage);

    // exportHintLabel：Label
    auto *w_exportHintLabel = new QLabel(w_exportPage);
    w_exportHintLabel->setProperty("wordWrap", true);
    add(QStringLiteral("exportHintLabel"), w_exportHintLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // exportBtn：Button
    auto *w_exportBtn = new QPushButton(w_exportPage);
    add(QStringLiteral("exportBtn"), w_exportBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_exportBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("exportBtn"), QStringLiteral("toggle"), value);
    });

    // exportResultLabel：Label
    auto *w_exportResultLabel = new QLabel(w_exportPage);
    w_exportResultLabel->setProperty("wordWrap", true);
    add(QStringLiteral("exportResultLabel"), w_exportResultLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // historyPage：容器
    auto *w_historyPage = new QFrame(w_inspectorStack);
    w_historyPage->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("historyPage"), w_historyPage);

    // historyToolbar：容器
    auto *w_historyToolbar = new QFrame(w_historyPage);
    w_historyToolbar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("historyToolbar"), w_historyToolbar);

    // undoBtn：Button
    auto *w_undoBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("undoBtn"), w_undoBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_undoBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("undoBtn"), QStringLiteral("toggle"), value);
    });

    // redoBtn：Button
    auto *w_redoBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("redoBtn"), w_redoBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_redoBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("redoBtn"), QStringLiteral("toggle"), value);
    });

    // clearHistoryBtn：Button
    auto *w_clearHistoryBtn = new QPushButton(w_historyToolbar);
    add(QStringLiteral("clearHistoryBtn"), w_clearHistoryBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_clearHistoryBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("clearHistoryBtn"), QStringLiteral("toggle"), value);
    });

    // historyList：List
    auto *w_historyList = new QListWidget(w_historyPage);
    add(QStringLiteral("historyList"), w_historyList, { { QStringLiteral("items"), "vfItems" }, { QStringLiteral("value"), "currentRow" }, { QStringLiteral("emptyText"), "vfEmptyText" }, { QStringLiteral("draggable"), "vfDraggable" }, { QStringLiteral("mutedFrom"), "vfMutedFrom" } });
    QObject::connect(w_historyList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("historyList"), QStringLiteral("change"), value);
    });
    QObject::connect(w_historyList, &QListWidget::currentRowChanged, q, [this](double value) {
        dispatch(QStringLiteral("historyList"), QStringLiteral("select"), value);
    });

    // timelineDock：停靠面板（bottom）
    auto *w_timelineDock = new QDockWidget(QStringLiteral("时间轴"), &window);
    w_timelineDock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    w_timelineDock->setStyleSheet(QStringLiteral("QDockWidget { border: none; }"));
    auto *hdr_w_timelineDock = new QLabel(QStringLiteral("时间轴"), w_timelineDock);
    hdr_w_timelineDock->setFixedHeight(26);
    w_timelineDock->setTitleBarWidget(hdr_w_timelineDock);
    auto *body_w_timelineDock = new QWidget(w_timelineDock);
    w_timelineDock->setWidget(body_w_timelineDock);
    w_timelineDock->setFixedHeight(132);
    window.addDockWidget(Qt::BottomDockWidgetArea, w_timelineDock);
    add(QStringLiteral("timelineDock"), w_timelineDock, { { QStringLiteral("title"), "windowTitle" } });

    // timelineTransportFlow：容器
    auto *w_timelineTransportFlow = new QFrame(body_w_timelineDock);
    w_timelineTransportFlow->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("timelineTransportFlow"), w_timelineTransportFlow);

    // playToggleBtn：Button
    auto *w_playToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("playToggleBtn"), w_playToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_playToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("playToggleBtn"), QStringLiteral("toggle"), value);
    });

    // prevFrameBtn：Button
    auto *w_prevFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("prevFrameBtn"), w_prevFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_prevFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("prevFrameBtn"), QStringLiteral("toggle"), value);
    });

    // nextFrameBtn：Button
    auto *w_nextFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("nextFrameBtn"), w_nextFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_nextFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("nextFrameBtn"), QStringLiteral("toggle"), value);
    });

    // addFrameBtn：Button
    auto *w_addFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("addFrameBtn"), w_addFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_addFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("addFrameBtn"), QStringLiteral("toggle"), value);
    });

    // removeFrameBtn：Button
    auto *w_removeFrameBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("removeFrameBtn"), w_removeFrameBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_removeFrameBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("removeFrameBtn"), QStringLiteral("toggle"), value);
    });

    // loopToggleBtn：Button
    auto *w_loopToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("loopToggleBtn"), w_loopToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_loopToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("loopToggleBtn"), QStringLiteral("toggle"), value);
    });

    // onionToggleBtn：Button
    auto *w_onionToggleBtn = new QPushButton(w_timelineTransportFlow);
    add(QStringLiteral("onionToggleBtn"), w_onionToggleBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_onionToggleBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("onionToggleBtn"), QStringLiteral("toggle"), value);
    });

    // fpsSelectCombo：ComboBox
    auto *w_fpsSelectCombo = new QComboBox(w_timelineTransportFlow);
    add(QStringLiteral("fpsSelectCombo"), w_fpsSelectCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_fpsSelectCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("fpsSelectCombo"), QStringLiteral("change"), value);
    });

    // frameSlider：Slider
    auto *w_frameSlider = new QSlider(w_timelineTransportFlow);
    add(QStringLiteral("frameSlider"), w_frameSlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_frameSlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("frameSlider"), QStringLiteral("change"), value);
    });

    // frameInfoLabel：Label
    auto *w_frameInfoLabel = new QLabel(w_timelineTransportFlow);
    w_frameInfoLabel->setProperty("wordWrap", true);
    add(QStringLiteral("frameInfoLabel"), w_frameInfoLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineTrackRow：容器
    auto *w_timelineTrackRow = new QFrame(body_w_timelineDock);
    w_timelineTrackRow->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("timelineTrackRow"), w_timelineTrackRow);

    // timelineTrackLabel：Label
    auto *w_timelineTrackLabel = new QLabel(w_timelineTrackRow);
    w_timelineTrackLabel->setProperty("wordWrap", true);
    add(QStringLiteral("timelineTrackLabel"), w_timelineTrackLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // timelineScrollBar：ScrollBar
    auto *w_timelineScrollBar = new QScrollBar(w_timelineTrackRow);
    add(QStringLiteral("timelineScrollBar"), w_timelineScrollBar, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("pageStep"), "pageStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_timelineScrollBar, &QScrollBar::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("timelineScrollBar"), QStringLiteral("change"), value);
    });

    // timelineOffsetLabel：Label
    auto *w_timelineOffsetLabel = new QLabel(w_timelineTrackRow);
    w_timelineOffsetLabel->setProperty("wordWrap", true);
    add(QStringLiteral("timelineOffsetLabel"), w_timelineOffsetLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusBar：容器
    auto *w_statusBar = new QFrame(&window);
    auto *qtStatusBar = new QStatusBar(&window);
    qtStatusBar->setSizeGripEnabled(false);
    qtStatusBar->setContentsMargins(0, 0, 0, 0);
    qtStatusBar->setFixedHeight(28);
    w_statusBar->setParent(qtStatusBar);
    w_statusBar->setGeometry(0, 0, 1280, 28);
    qtStatusBar->installEventFilter(q);
    statusBar = qtStatusBar;
    statusBarControl = w_statusBar;
    window.setStatusBar(qtStatusBar);
    w_statusBar->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("statusBar"), w_statusBar);

    // statusTextLabel：Label
    auto *w_statusTextLabel = new QLabel(w_statusBar);
    w_statusTextLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusTextLabel"), w_statusTextLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusClockLabel：Label
    auto *w_statusClockLabel = new QLabel(w_statusBar);
    w_statusClockLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusClockLabel"), w_statusClockLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // statusLayerCountLabel：Label
    auto *w_statusLayerCountLabel = new QLabel(w_statusBar);
    w_statusLayerCountLabel->setProperty("wordWrap", true);
    add(QStringLiteral("statusLayerCountLabel"), w_statusLayerCountLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // newProjectDialog：对话框
    auto *w_newProjectDialog = new QDialog(&window);
    w_newProjectDialog->setWindowTitle(QStringLiteral("新建动画项目"));
    w_newProjectDialog->setFixedSize(420, 320);
    w_newProjectDialog->setModal(true);
    dialogs.append(w_newProjectDialog);
    add(QStringLiteral("newProjectDialog"), w_newProjectDialog);
    QObject::connect(w_newProjectDialog, &QDialog::finished, q, [this] {
        onDialogFinished(QStringLiteral("newProjectDialog"));
    });

    // newProjectForm：容器
    auto *w_newProjectForm = new QFrame(w_newProjectDialog);
    w_newProjectForm->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("newProjectForm"), w_newProjectForm);

    // nameFormLabel：Label
    auto *w_nameFormLabel = new QLabel(w_newProjectForm);
    w_nameFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("nameFormLabel"), w_nameFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // projectNameInput：TextInput
    auto *w_projectNameInput = new QLineEdit(w_newProjectForm);
    add(QStringLiteral("projectNameInput"), w_projectNameInput, { { QStringLiteral("placeholder"), "placeholderText" }, { QStringLiteral("value"), "text" } });
    QObject::connect(w_projectNameInput, &QLineEdit::textEdited, q, [this](const QString &value) {
        dispatch(QStringLiteral("projectNameInput"), QStringLiteral("change"), value);
    });

    // presetFormLabel：Label
    auto *w_presetFormLabel = new QLabel(w_newProjectForm);
    w_presetFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("presetFormLabel"), w_presetFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // presetCombo：ComboBox
    auto *w_presetCombo = new QComboBox(w_newProjectForm);
    add(QStringLiteral("presetCombo"), w_presetCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_presetCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("presetCombo"), QStringLiteral("change"), value);
    });

    // widthFormLabel：Label
    auto *w_widthFormLabel = new QLabel(w_newProjectForm);
    w_widthFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("widthFormLabel"), w_widthFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // widthSpin：SpinBox
    auto *w_widthSpin = new QSpinBox(w_newProjectForm);
    add(QStringLiteral("widthSpin"), w_widthSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_widthSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("widthSpin"), QStringLiteral("change"), value);
    });

    // heightFormLabel：Label
    auto *w_heightFormLabel = new QLabel(w_newProjectForm);
    w_heightFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("heightFormLabel"), w_heightFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // heightSpin：SpinBox
    auto *w_heightSpin = new QSpinBox(w_newProjectForm);
    add(QStringLiteral("heightSpin"), w_heightSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_heightSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("heightSpin"), QStringLiteral("change"), value);
    });

    // transparentFormLabel：Label
    auto *w_transparentFormLabel = new QLabel(w_newProjectForm);
    w_transparentFormLabel->setProperty("wordWrap", true);
    add(QStringLiteral("transparentFormLabel"), w_transparentFormLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // transparentCheck：CheckBox
    auto *w_transparentCheck = new QCheckBox(w_newProjectForm);
    add(QStringLiteral("transparentCheck"), w_transparentCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_transparentCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("transparentCheck"), QStringLiteral("change"), value);
    });

    // dialogSep：Separator
    auto *w_dialogSep = new QFrame(w_newProjectDialog);
    w_dialogSep->setProperty("frameShape", 4);
    w_dialogSep->setProperty("frameShadow", 48);
    add(QStringLiteral("dialogSep"), w_dialogSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // dialogFooter：容器
    auto *w_dialogFooter = new QFrame(w_newProjectDialog);
    w_dialogFooter->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("dialogFooter"), w_dialogFooter);

    // dialogSpacerLabel：Label
    auto *w_dialogSpacerLabel = new QLabel(w_dialogFooter);
    w_dialogSpacerLabel->setProperty("wordWrap", true);
    add(QStringLiteral("dialogSpacerLabel"), w_dialogSpacerLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // cancelNewProjectBtn：Button
    auto *w_cancelNewProjectBtn = new QPushButton(w_dialogFooter);
    add(QStringLiteral("cancelNewProjectBtn"), w_cancelNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_cancelNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("cancelNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // confirmNewProjectBtn：Button
    auto *w_confirmNewProjectBtn = new QPushButton(w_dialogFooter);
    add(QStringLiteral("confirmNewProjectBtn"), w_confirmNewProjectBtn, { { QStringLiteral("text"), "text" }, { QStringLiteral("icon"), "vfIcon" }, { QStringLiteral("variant"), "vfVariant" }, { QStringLiteral("checkable"), "checkable" }, { QStringLiteral("checked"), "checked" } });
    QObject::connect(w_confirmNewProjectBtn, &QPushButton::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("confirmNewProjectBtn"), QStringLiteral("toggle"), value);
    });

    // drawSettingsDialog：对话框
    auto *w_drawSettingsDialog = new QDialog(&window);
    w_drawSettingsDialog->setWindowTitle(QStringLiteral("画笔与压感设置"));
    w_drawSettingsDialog->setFixedSize(400, 260);
    w_drawSettingsDialog->setModal(true);
    dialogs.append(w_drawSettingsDialog);
    add(QStringLiteral("drawSettingsDialog"), w_drawSettingsDialog);
    QObject::connect(w_drawSettingsDialog, &QDialog::finished, q, [this] {
        onDialogFinished(QStringLiteral("drawSettingsDialog"));
    });

    // drawSettingsForm：容器
    auto *w_drawSettingsForm = new QFrame(w_drawSettingsDialog);
    w_drawSettingsForm->setFrameShape(QFrame::NoFrame);
    add(QStringLiteral("drawSettingsForm"), w_drawSettingsForm);

    // pressureCurveLabel：Label
    auto *w_pressureCurveLabel = new QLabel(w_drawSettingsForm);
    w_pressureCurveLabel->setProperty("wordWrap", true);
    add(QStringLiteral("pressureCurveLabel"), w_pressureCurveLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // pressureCurveCombo：ComboBox
    auto *w_pressureCurveCombo = new QComboBox(w_drawSettingsForm);
    add(QStringLiteral("pressureCurveCombo"), w_pressureCurveCombo, { { QStringLiteral("options"), "vfOptions" }, { QStringLiteral("value"), "currentText" } });
    QObject::connect(w_pressureCurveCombo, &QComboBox::currentTextChanged, q, [this](const QString &value) {
        dispatch(QStringLiteral("pressureCurveCombo"), QStringLiteral("change"), value);
    });

    // minRadiusLabel：Label
    auto *w_minRadiusLabel = new QLabel(w_drawSettingsForm);
    w_minRadiusLabel->setProperty("wordWrap", true);
    add(QStringLiteral("minRadiusLabel"), w_minRadiusLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // minRadiusSpin：SpinBox
    auto *w_minRadiusSpin = new QSpinBox(w_drawSettingsForm);
    add(QStringLiteral("minRadiusSpin"), w_minRadiusSpin, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("suffix"), "suffix" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_minRadiusSpin, &QSpinBox::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("minRadiusSpin"), QStringLiteral("change"), value);
    });

    // tiltSensLabel：Label
    auto *w_tiltSensLabel = new QLabel(w_drawSettingsForm);
    w_tiltSensLabel->setProperty("wordWrap", true);
    add(QStringLiteral("tiltSensLabel"), w_tiltSensLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // tiltSensitivitySlider：Slider
    auto *w_tiltSensitivitySlider = new QSlider(w_drawSettingsForm);
    add(QStringLiteral("tiltSensitivitySlider"), w_tiltSensitivitySlider, { { QStringLiteral("min"), "minimum" }, { QStringLiteral("max"), "maximum" }, { QStringLiteral("step"), "singleStep" }, { QStringLiteral("orientation"), "vfOrientation" }, { QStringLiteral("value"), "value" } });
    QObject::connect(w_tiltSensitivitySlider, &QSlider::valueChanged, q, [this](double value) {
        dispatch(QStringLiteral("tiltSensitivitySlider"), QStringLiteral("change"), value);
    });

    // antiAliasLabel：Label
    auto *w_antiAliasLabel = new QLabel(w_drawSettingsForm);
    w_antiAliasLabel->setProperty("wordWrap", true);
    add(QStringLiteral("antiAliasLabel"), w_antiAliasLabel, { { QStringLiteral("text"), "text" }, { QStringLiteral("tone"), "vfTone" }, { QStringLiteral("align"), "vfAlign" } });

    // antiAliasCheck：CheckBox
    auto *w_antiAliasCheck = new QCheckBox(w_drawSettingsForm);
    add(QStringLiteral("antiAliasCheck"), w_antiAliasCheck, { { QStringLiteral("text"), "text" }, { QStringLiteral("value"), "checked" } });
    QObject::connect(w_antiAliasCheck, &QCheckBox::toggled, q, [this](bool value) {
        dispatch(QStringLiteral("antiAliasCheck"), QStringLiteral("change"), value);
    });

    // drawDialogSep：Separator
    auto *w_drawDialogSep = new QFrame(w_drawSettingsDialog);
    w_drawDialogSep->setProperty("frameShape", 4);
    w_drawDialogSep->setProperty("frameShadow", 48);
    add(QStringLiteral("drawDialogSep"), w_drawDialogSep, { { QStringLiteral("orientation"), "vfOrientation" } });

    // drawSettingsButtonBox：DialogButtonBox
    auto *w_drawSettingsButtonBox = new QDialogButtonBox(w_drawSettingsDialog);
    add(QStringLiteral("drawSettingsButtonBox"), w_drawSettingsButtonBox, { { QStringLiteral("buttons"), "vfButtons" }, { QStringLiteral("okText"), "vfOkText" }, { QStringLiteral("cancelText"), "vfCancelText" } });
    QObject::connect(w_drawSettingsButtonBox, &QDialogButtonBox::accepted, q, [this]() {
        dispatch(QStringLiteral("drawSettingsButtonBox"), QStringLiteral("accept"));
    });
    QObject::connect(w_drawSettingsButtonBox, &QDialogButtonBox::rejected, q, [this]() {
        dispatch(QStringLiteral("drawSettingsButtonBox"), QStringLiteral("reject"));
    });

    // toolsDock 的排版（hbox）
    auto *lay_body_w_toolsDock = new QHBoxLayout(body_w_toolsDock);
    lay_body_w_toolsDock->setContentsMargins(12, 4, 12, 4);
    lay_body_w_toolsDock->setSpacing(6);
    w_newProjectBtn->setMinimumHeight(0);
    w_newProjectBtn->setFixedWidth(88);
    w_newProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_newProjectBtn, 0);
    w_toolbarSep1->setMinimumHeight(0);
    w_toolbarSep1->setFixedWidth(6);
    w_toolbarSep1->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolbarSep1, 0);
    w_toolBrushBtn->setMinimumHeight(0);
    w_toolBrushBtn->setFixedWidth(64);
    w_toolBrushBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolBrushBtn, 0);
    w_toolEraserBtn->setMinimumHeight(0);
    w_toolEraserBtn->setFixedWidth(64);
    w_toolEraserBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolEraserBtn, 0);
    w_toolFillBtn->setMinimumHeight(0);
    w_toolFillBtn->setFixedWidth(64);
    w_toolFillBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolFillBtn, 0);
    w_toolShapeBtn->setMinimumHeight(0);
    w_toolShapeBtn->setFixedWidth(64);
    w_toolShapeBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolShapeBtn, 0);
    w_toolSelectBtn->setMinimumHeight(0);
    w_toolSelectBtn->setFixedWidth(64);
    w_toolSelectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolSelectBtn, 0);
    w_toolMoveBtn->setMinimumHeight(0);
    w_toolMoveBtn->setFixedWidth(64);
    w_toolMoveBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolMoveBtn, 0);
    w_toolEyedropperBtn->setMinimumHeight(0);
    w_toolEyedropperBtn->setFixedWidth(64);
    w_toolEyedropperBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolEyedropperBtn, 0);
    w_toolbarSep2->setMinimumHeight(0);
    w_toolbarSep2->setFixedWidth(6);
    w_toolbarSep2->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolbarSep2, 0);
    w_toolMoreMenuBtn->setMinimumHeight(0);
    w_toolMoreMenuBtn->setFixedWidth(84);
    w_toolMoreMenuBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolMoreMenuBtn, 0);
    w_toolbarSpacer->setMinimumHeight(0);
    w_toolbarSpacer->setMinimumWidth(0);
    w_toolbarSpacer->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_toolbarSpacer, 1);
    w_projectSummaryLabel->setMinimumHeight(0);
    w_projectSummaryLabel->setFixedWidth(210);
    w_projectSummaryLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_body_w_toolsDock->addWidget(w_projectSummaryLabel, 0);

    // layersDock 的排版（vbox）
    auto *lay_body_w_layersDock = new QVBoxLayout(body_w_layersDock);
    lay_body_w_layersDock->setContentsMargins(8, 8, 8, 8);
    lay_body_w_layersDock->setSpacing(6);
    w_layerToolbar->setFixedHeight(28);
    w_layerToolbar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerToolbar, 0);
    w_layerTree->setFixedHeight(116);
    w_layerTree->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerTree, 0);
    w_layerList->setMinimumHeight(0);
    w_layerList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_layersDock->addWidget(w_layerList, 1);
    w_layerVisibilityBar->setFixedHeight(28);
    w_layerVisibilityBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_layerVisibilityBar, 0);
    w_assetsPanelSep->setFixedHeight(4);
    w_assetsPanelSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetsPanelSep, 0);
    w_assetsHeaderBar->setFixedHeight(26);
    w_assetsHeaderBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetsHeaderBar, 0);
    w_assetList->setFixedHeight(76);
    w_assetList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetList, 0);
    w_assetNoteInput->setFixedHeight(56);
    w_assetNoteInput->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_layersDock->addWidget(w_assetNoteInput, 0);

    // layerToolbar 的排版（hbox）
    auto *lay_w_layerToolbar = new QHBoxLayout(w_layerToolbar);
    lay_w_layerToolbar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerToolbar->setSpacing(4);
    w_addLayerBtn->setMinimumHeight(0);
    w_addLayerBtn->setFixedWidth(46);
    w_addLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_addLayerBtn, 0);
    w_addGroupBtn->setMinimumHeight(0);
    w_addGroupBtn->setFixedWidth(46);
    w_addGroupBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_addGroupBtn, 0);
    w_removeLayerBtn->setMinimumHeight(0);
    w_removeLayerBtn->setFixedWidth(46);
    w_removeLayerBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_removeLayerBtn, 0);
    w_moveLayerUpBtn->setMinimumHeight(0);
    w_moveLayerUpBtn->setFixedWidth(45);
    w_moveLayerUpBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerUpBtn, 0);
    w_moveLayerDownBtn->setMinimumHeight(0);
    w_moveLayerDownBtn->setFixedWidth(45);
    w_moveLayerDownBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerToolbar->addWidget(w_moveLayerDownBtn, 0);
    lay_w_layerToolbar->addStretch(1);

    // layerVisibilityBar 的排版（hbox）
    auto *lay_w_layerVisibilityBar = new QHBoxLayout(w_layerVisibilityBar);
    lay_w_layerVisibilityBar->setContentsMargins(0, 0, 0, 0);
    lay_w_layerVisibilityBar->setSpacing(6);
    w_layerVisibleLabel->setMinimumHeight(0);
    w_layerVisibleLabel->setMinimumWidth(0);
    w_layerVisibleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_layerVisibleLabel, 1);
    w_toggleVisibleBtn->setMinimumHeight(0);
    w_toggleVisibleBtn->setFixedWidth(100);
    w_toggleVisibleBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_layerVisibilityBar->addWidget(w_toggleVisibleBtn, 0);

    // assetsHeaderBar 的排版（hbox）
    auto *lay_w_assetsHeaderBar = new QHBoxLayout(w_assetsHeaderBar);
    lay_w_assetsHeaderBar->setContentsMargins(0, 0, 0, 0);
    lay_w_assetsHeaderBar->setSpacing(4);
    w_assetsTitleLabel->setMinimumHeight(0);
    w_assetsTitleLabel->setMinimumWidth(0);
    w_assetsTitleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_assetsTitleLabel, 1);
    w_addAssetBtn->setMinimumHeight(0);
    w_addAssetBtn->setFixedWidth(56);
    w_addAssetBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_addAssetBtn, 0);
    w_removeAssetBtn->setMinimumHeight(0);
    w_removeAssetBtn->setFixedWidth(56);
    w_removeAssetBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_assetsHeaderBar->addWidget(w_removeAssetBtn, 0);

    // centralArea 的排版（vbox）
    auto *lay_w_centralArea = new QVBoxLayout(w_centralArea);
    lay_w_centralArea->setContentsMargins(8, 8, 8, 8);
    lay_w_centralArea->setSpacing(6);
    w_canvasHeader->setFixedHeight(30);
    w_canvasHeader->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_centralArea->addWidget(w_canvasHeader, 0);
    w_canvasHost->setMinimumHeight(0);
    w_canvasHost->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_centralArea->addWidget(w_canvasHost, 1);

    // canvasHeader 的排版（hbox）
    auto *lay_w_canvasHeader = new QHBoxLayout(w_canvasHeader);
    lay_w_canvasHeader->setContentsMargins(0, 0, 0, 0);
    lay_w_canvasHeader->setSpacing(6);
    w_workspaceTabBar->setMinimumHeight(0);
    w_workspaceTabBar->setFixedWidth(148);
    w_workspaceTabBar->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_workspaceTabBar, 0);
    w_canvasTitleLabel->setMinimumHeight(0);
    w_canvasTitleLabel->setMinimumWidth(0);
    w_canvasTitleLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_canvasTitleLabel, 1);
    w_zoomSlider->setMinimumHeight(0);
    w_zoomSlider->setFixedWidth(96);
    w_zoomSlider->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_zoomSlider, 0);
    w_activeToolLabel->setMinimumHeight(0);
    w_activeToolLabel->setFixedWidth(116);
    w_activeToolLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_canvasHeader->addWidget(w_activeToolLabel, 0);

    // inspectorDock 的排版（vbox）
    auto *lay_body_w_inspectorDock = new QVBoxLayout(body_w_inspectorDock);
    lay_body_w_inspectorDock->setContentsMargins(8, 8, 8, 8);
    lay_body_w_inspectorDock->setSpacing(6);
    w_toolOptHeader->setFixedHeight(22);
    w_toolOptHeader->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_toolOptHeader, 0);
    w_toolOptionsForm->setFixedHeight(172);
    w_toolOptionsForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_toolOptionsForm, 0);
    w_inspectorSep1->setFixedHeight(4);
    w_inspectorSep1->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_inspectorSep1, 0);
    w_inspectorTabs->setFixedHeight(30);
    w_inspectorTabs->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_inspectorDock->addWidget(w_inspectorTabs, 0);
    w_inspectorStack->setMinimumHeight(0);
    w_inspectorStack->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_body_w_inspectorDock->addWidget(w_inspectorStack, 1);

    // inspectorTabs 的排版（grid）
    auto *lay_w_inspectorTabs = new QGridLayout(w_inspectorTabs);
    lay_w_inspectorTabs->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorTabs->setHorizontalSpacing(4);
    lay_w_inspectorTabs->setVerticalSpacing(4);
    lay_w_inspectorTabs->setColumnStretch(0, 1);
    lay_w_inspectorTabs->setColumnStretch(1, 1);
    lay_w_inspectorTabs->setColumnStretch(2, 1);
    lay_w_inspectorTabs->setRowStretch(0, 0);
    lay_w_inspectorTabs->setRowMinimumHeight(0, 30);
    lay_w_inspectorTabs->setRowStretch(1, 1);
    w_tabPropsBtn->setFixedHeight(30);
    w_tabPropsBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabPropsBtn, 0, 0, 1, 1);
    w_tabHistoryBtn->setFixedHeight(30);
    w_tabHistoryBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabHistoryBtn, 0, 1, 1, 1);
    w_tabExportBtn->setFixedHeight(30);
    w_tabExportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_inspectorTabs->addWidget(w_tabExportBtn, 0, 2, 1, 1);

    // inspectorStack 的排版（stack）
    auto *lay_w_inspectorStack = new QVBoxLayout(w_inspectorStack);
    lay_w_inspectorStack->setContentsMargins(0, 0, 0, 0);
    lay_w_inspectorStack->setSpacing(0);
    w_layerPropsPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_layerPropsPage, 1);
    w_exportPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_exportPage, 1);
    w_historyPage->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_inspectorStack->addWidget(w_historyPage, 1);

    // layerPropsPage 的排版（form）
    auto *lay_w_layerPropsPage = new QGridLayout(w_layerPropsPage);
    lay_w_layerPropsPage->setContentsMargins(4, 4, 4, 4);
    lay_w_layerPropsPage->setHorizontalSpacing(8);
    lay_w_layerPropsPage->setVerticalSpacing(8);
    lay_w_layerPropsPage->setColumnMinimumWidth(0, 76);
    lay_w_layerPropsPage->setColumnStretch(0, 0);
    lay_w_layerPropsPage->setColumnStretch(1, 1);
    w_blendLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_blendLabel, 0, 0);
    w_blendCombo->setFixedHeight(30);
    w_blendCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_blendCombo, 0, 1);
    w_opacityLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_opacityLabel, 1, 0);
    w_opacitySpin->setFixedHeight(30);
    w_opacitySpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_opacitySpin, 1, 1);
    w_lockLabel->setFixedSize(76, 30);
    lay_w_layerPropsPage->addWidget(w_lockLabel, 2, 0);
    w_lockLayerCheck->setFixedHeight(30);
    w_lockLayerCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_layerPropsPage->addWidget(w_lockLayerCheck, 2, 1);
    lay_w_layerPropsPage->setRowStretch(3, 1);

    // exportPage 的排版（vbox）
    auto *lay_w_exportPage = new QVBoxLayout(w_exportPage);
    lay_w_exportPage->setContentsMargins(4, 4, 4, 4);
    lay_w_exportPage->setSpacing(8);
    w_exportHintLabel->setFixedHeight(28);
    w_exportHintLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportHintLabel, 0);
    w_exportBtn->setFixedHeight(32);
    w_exportBtn->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportBtn, 0);
    w_exportResultLabel->setFixedHeight(28);
    w_exportResultLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_exportPage->addWidget(w_exportResultLabel, 0);
    lay_w_exportPage->addStretch(1);

    // historyPage 的排版（vbox）
    auto *lay_w_historyPage = new QVBoxLayout(w_historyPage);
    lay_w_historyPage->setContentsMargins(4, 4, 4, 4);
    lay_w_historyPage->setSpacing(6);
    w_historyToolbar->setFixedHeight(28);
    w_historyToolbar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_historyPage->addWidget(w_historyToolbar, 0);
    w_historyList->setMinimumHeight(0);
    w_historyList->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_historyPage->addWidget(w_historyList, 1);

    // historyToolbar 的排版（hbox）
    auto *lay_w_historyToolbar = new QHBoxLayout(w_historyToolbar);
    lay_w_historyToolbar->setContentsMargins(0, 0, 0, 0);
    lay_w_historyToolbar->setSpacing(6);
    w_undoBtn->setMinimumHeight(0);
    w_undoBtn->setFixedWidth(86);
    w_undoBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_undoBtn, 0);
    w_redoBtn->setMinimumHeight(0);
    w_redoBtn->setFixedWidth(86);
    w_redoBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_redoBtn, 0);
    w_clearHistoryBtn->setMinimumHeight(0);
    w_clearHistoryBtn->setFixedWidth(88);
    w_clearHistoryBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_historyToolbar->addWidget(w_clearHistoryBtn, 0);
    lay_w_historyToolbar->addStretch(1);

    // timelineDock 的排版（vbox）
    auto *lay_body_w_timelineDock = new QVBoxLayout(body_w_timelineDock);
    lay_body_w_timelineDock->setContentsMargins(12, 6, 12, 6);
    lay_body_w_timelineDock->setSpacing(6);
    w_timelineTransportFlow->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
    lay_body_w_timelineDock->addWidget(w_timelineTransportFlow, 0);
    w_timelineTrackRow->setFixedHeight(26);
    w_timelineTrackRow->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_body_w_timelineDock->addWidget(w_timelineTrackRow, 0);
    lay_body_w_timelineDock->addStretch(1);

    // timelineTransportFlow 的排版（flow）
    auto *lay_w_timelineTransportFlow = new VfFlowLayout(w_timelineTransportFlow, 0, 0, 0, 0, 8, 4, 0, 1000000, true);
    lay_w_timelineTransportFlow->addFlowWidget(w_playToggleBtn, 78, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_prevFrameBtn, 72, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_nextFrameBtn, 72, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_addFrameBtn, 78, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_removeFrameBtn, 78, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_loopToggleBtn, 74, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_onionToggleBtn, 74, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_fpsSelectCombo, 92, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_frameSlider, 180, 28, 0, 1000000, 0);
    lay_w_timelineTransportFlow->addFlowWidget(w_frameInfoLabel, 170, 28, 0, 1000000, 0);

    // timelineTrackRow 的排版（hbox）
    auto *lay_w_timelineTrackRow = new QHBoxLayout(w_timelineTrackRow);
    lay_w_timelineTrackRow->setContentsMargins(0, 0, 0, 0);
    lay_w_timelineTrackRow->setSpacing(8);
    w_timelineTrackLabel->setMinimumHeight(0);
    w_timelineTrackLabel->setFixedWidth(110);
    w_timelineTrackLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineTrackLabel, 0);
    w_timelineScrollBar->setMinimumHeight(0);
    w_timelineScrollBar->setMinimumWidth(0);
    w_timelineScrollBar->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineScrollBar, 1);
    w_timelineOffsetLabel->setMinimumHeight(0);
    w_timelineOffsetLabel->setFixedWidth(120);
    w_timelineOffsetLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_timelineTrackRow->addWidget(w_timelineOffsetLabel, 0);

    // statusBar 的排版（hbox）
    auto *lay_w_statusBar = new QHBoxLayout(w_statusBar);
    lay_w_statusBar->setContentsMargins(12, 0, 12, 0);
    lay_w_statusBar->setSpacing(12);
    w_statusTextLabel->setMinimumHeight(0);
    w_statusTextLabel->setMinimumWidth(0);
    w_statusTextLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusTextLabel, 1);
    w_statusClockLabel->setMinimumHeight(0);
    w_statusClockLabel->setFixedWidth(150);
    w_statusClockLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusClockLabel, 0);
    w_statusLayerCountLabel->setMinimumHeight(0);
    w_statusLayerCountLabel->setFixedWidth(140);
    w_statusLayerCountLabel->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_statusBar->addWidget(w_statusLayerCountLabel, 0);

    // newProjectDialog 的排版（vbox）
    auto *lay_w_newProjectDialog = new QVBoxLayout(w_newProjectDialog);
    lay_w_newProjectDialog->setContentsMargins(16, 16, 16, 16);
    lay_w_newProjectDialog->setSpacing(12);
    w_newProjectForm->setMinimumHeight(0);
    w_newProjectForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_newProjectDialog->addWidget(w_newProjectForm, 1);
    w_dialogSep->setFixedHeight(6);
    w_dialogSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectDialog->addWidget(w_dialogSep, 0);
    w_dialogFooter->setFixedHeight(34);
    w_dialogFooter->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectDialog->addWidget(w_dialogFooter, 0);

    // newProjectForm 的排版（form）
    auto *lay_w_newProjectForm = new QGridLayout(w_newProjectForm);
    lay_w_newProjectForm->setContentsMargins(0, 0, 0, 0);
    lay_w_newProjectForm->setHorizontalSpacing(8);
    lay_w_newProjectForm->setVerticalSpacing(8);
    lay_w_newProjectForm->setColumnMinimumWidth(0, 88);
    lay_w_newProjectForm->setColumnStretch(0, 0);
    lay_w_newProjectForm->setColumnStretch(1, 1);
    w_nameFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_nameFormLabel, 0, 0);
    w_projectNameInput->setFixedHeight(30);
    w_projectNameInput->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_projectNameInput, 0, 1);
    w_presetFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_presetFormLabel, 1, 0);
    w_presetCombo->setFixedHeight(30);
    w_presetCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_presetCombo, 1, 1);
    w_widthFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_widthFormLabel, 2, 0);
    w_widthSpin->setFixedHeight(30);
    w_widthSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_widthSpin, 2, 1);
    w_heightFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_heightFormLabel, 3, 0);
    w_heightSpin->setFixedHeight(30);
    w_heightSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_heightSpin, 3, 1);
    w_transparentFormLabel->setFixedSize(88, 30);
    lay_w_newProjectForm->addWidget(w_transparentFormLabel, 4, 0);
    w_transparentCheck->setFixedHeight(30);
    w_transparentCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_newProjectForm->addWidget(w_transparentCheck, 4, 1);
    lay_w_newProjectForm->setRowStretch(5, 1);

    // dialogFooter 的排版（hbox）
    auto *lay_w_dialogFooter = new QHBoxLayout(w_dialogFooter);
    lay_w_dialogFooter->setContentsMargins(0, 0, 0, 0);
    lay_w_dialogFooter->setSpacing(8);
    w_dialogSpacerLabel->setMinimumHeight(0);
    w_dialogSpacerLabel->setMinimumWidth(0);
    w_dialogSpacerLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_dialogSpacerLabel, 1);
    w_cancelNewProjectBtn->setMinimumHeight(0);
    w_cancelNewProjectBtn->setFixedWidth(92);
    w_cancelNewProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_cancelNewProjectBtn, 0);
    w_confirmNewProjectBtn->setMinimumHeight(0);
    w_confirmNewProjectBtn->setFixedWidth(92);
    w_confirmNewProjectBtn->setSizePolicy(QSizePolicy::Fixed, QSizePolicy::Ignored);
    lay_w_dialogFooter->addWidget(w_confirmNewProjectBtn, 0);

    // drawSettingsDialog 的排版（vbox）
    auto *lay_w_drawSettingsDialog = new QVBoxLayout(w_drawSettingsDialog);
    lay_w_drawSettingsDialog->setContentsMargins(16, 16, 16, 16);
    lay_w_drawSettingsDialog->setSpacing(10);
    w_drawSettingsForm->setMinimumHeight(0);
    w_drawSettingsForm->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Ignored);
    lay_w_drawSettingsDialog->addWidget(w_drawSettingsForm, 1);
    w_drawDialogSep->setFixedHeight(6);
    w_drawDialogSep->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsDialog->addWidget(w_drawDialogSep, 0);
    w_drawSettingsButtonBox->setFixedHeight(34);
    w_drawSettingsButtonBox->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsDialog->addWidget(w_drawSettingsButtonBox, 0);

    // drawSettingsForm 的排版（form）
    auto *lay_w_drawSettingsForm = new QGridLayout(w_drawSettingsForm);
    lay_w_drawSettingsForm->setContentsMargins(0, 0, 0, 0);
    lay_w_drawSettingsForm->setHorizontalSpacing(8);
    lay_w_drawSettingsForm->setVerticalSpacing(8);
    lay_w_drawSettingsForm->setColumnMinimumWidth(0, 88);
    lay_w_drawSettingsForm->setColumnStretch(0, 0);
    lay_w_drawSettingsForm->setColumnStretch(1, 1);
    w_pressureCurveLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_pressureCurveLabel, 0, 0);
    w_pressureCurveCombo->setFixedHeight(30);
    w_pressureCurveCombo->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_pressureCurveCombo, 0, 1);
    w_minRadiusLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_minRadiusLabel, 1, 0);
    w_minRadiusSpin->setFixedHeight(30);
    w_minRadiusSpin->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_minRadiusSpin, 1, 1);
    w_tiltSensLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_tiltSensLabel, 2, 0);
    w_tiltSensitivitySlider->setFixedHeight(30);
    w_tiltSensitivitySlider->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_tiltSensitivitySlider, 2, 1);
    w_antiAliasLabel->setFixedSize(88, 30);
    lay_w_drawSettingsForm->addWidget(w_antiAliasLabel, 3, 0);
    w_antiAliasCheck->setFixedHeight(30);
    w_antiAliasCheck->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Fixed);
    lay_w_drawSettingsForm->addWidget(w_antiAliasCheck, 3, 1);
    lay_w_drawSettingsForm->setRowStretch(4, 1);
}

// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。
bool Ui::Private::raiseBusinessEvent(const QString &name, const QJSValue &args)
{
    if (name == QLatin1String("layerToggleVisible")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::layerToggleVisibleRequested);
        if (!q->isSignalConnected(signal))
            return false;
        emit q->layerToggleVisibleRequested();
        return true;
    }
    if (name == QLatin1String("exportClip")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::actionExportClipRequested);
        if (!q->isSignalConnected(signal))
            return false;
        emit q->actionExportClipRequested(args.toVariant().toMap());
        return true;
    }
    return false;
}

// 显示隐藏的过渡：有人提供了实现，就让它创建动画并返回；没有就返回空，由调用方直接切到结束状态。
QAbstractAnimation *Ui::Private::createVisibility(int effect, QWidget *target, bool showing)
{
    Q_UNUSED(effect);
    Q_UNUSED(target);
    Q_UNUSED(showing);
    return nullptr;
}

// 业务接口的实现
void Ui::setLayerVisible(bool value)
{
    d->setBusinessState(QStringLiteral("layer.visible"), value);
}

bool Ui::layerVisible() const
{
    return d->call("getState", { QStringLiteral("layer.visible") }).toBool();
}

void Ui::requestNotifyStatus(const QString &message)
{
    QJSValue args = d->engine.newObject();
    args.setProperty(QStringLiteral("message"), message);
    d->requestEvent(QStringLiteral("notifyStatus"), args);
}

void Ui::finishExportClipSuccess(const QVariantMap &result)
{
    d->drain(d->call("finishActionSuccess", { QStringLiteral("exportClip"), d->engine.toScriptValue(result) }));
}

void Ui::finishExportClipError(const QString &message)
{
    d->drain(d->call("finishActionError", { QStringLiteral("exportClip"), message }));
}

void Ui::setCanvasHostWidget(QWidget *widget)
{
    d->setExternal(QStringLiteral("canvasHost"), widget);
}

} // namespace vf
