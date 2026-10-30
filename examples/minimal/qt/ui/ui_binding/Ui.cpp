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

// 控件树和位置。每个控件的对象名就是它在设计项目里的 ID。
void Ui::Private::build()
{
    window.setWindowTitle(QStringLiteral("导出样板"));
    auto *w_sampleWindow = new QWidget(&window);
    w_sampleWindow->setFixedSize(520, 420);
    window.setCentralWidget(w_sampleWindow);
    add(QStringLiteral("sampleWindow"), w_sampleWindow);

    // canvasHost：外部容器
    auto *w_canvasHost = new QFrame(w_sampleWindow);
    w_canvasHost->setGeometry(12, 12, 496, 244);
    addExternal(QStringLiteral("canvasHost"), w_canvasHost, QStringLiteral("外部容器 canvasHost\n（业务还没有放入控件）"));

    // toggleButton：Button
    auto *w_toggleButton = new QPushButton(w_sampleWindow);
    w_toggleButton->setGeometry(12, 268, 120, 32);
    add(QStringLiteral("toggleButton"), w_toggleButton, { { QStringLiteral("text"), "text" } });

    // layerShownLabel：Label
    auto *w_layerShownLabel = new QLabel(w_sampleWindow);
    w_layerShownLabel->setGeometry(144, 268, 220, 32);
    w_layerShownLabel->setProperty("wordWrap", true);
    add(QStringLiteral("layerShownLabel"), w_layerShownLabel, { { QStringLiteral("text"), "text" } });

    // layerHiddenLabel：Label
    auto *w_layerHiddenLabel = new QLabel(w_sampleWindow);
    w_layerHiddenLabel->setGeometry(144, 268, 220, 32);
    w_layerHiddenLabel->setProperty("wordWrap", true);
    add(QStringLiteral("layerHiddenLabel"), w_layerHiddenLabel, { { QStringLiteral("text"), "text" } });

    // expandButton：Button
    auto *w_expandButton = new QPushButton(w_sampleWindow);
    w_expandButton->setGeometry(398, 268, 110, 32);
    add(QStringLiteral("expandButton"), w_expandButton, { { QStringLiteral("text"), "text" } });

    // detailPanel：容器
    auto *w_detailPanel = new QFrame(w_sampleWindow);
    w_detailPanel->setGeometry(12, 312, 496, 96);
    w_detailPanel->setFrameShape(QFrame::StyledPanel);
    add(QStringLiteral("detailPanel"), w_detailPanel, {}, 0 /* 效果 PanelExpand */);

    // detailLabel：Label
    auto *w_detailLabel = new QLabel(w_detailPanel);
    w_detailLabel->setGeometry(12, 8, 472, 80);
    w_detailLabel->setProperty("wordWrap", true);
    add(QStringLiteral("detailLabel"), w_detailLabel, { { QStringLiteral("text"), "text" } });
}

// 交给业务的事件：业务连接了对应的信号，就发信号并返回 true；没有连接，返回 false，由调用方执行模拟步骤。
bool Ui::Private::raiseBusinessEvent(const QString &name, const QJSValue &args)
{
    Q_UNUSED(args);
    if (name == QLatin1String("layerToggleVisible")) {
        static const QMetaMethod signal = QMetaMethod::fromSignal(&BusinessInterface::layerToggleVisibleRequested);
        if (!q->isSignalConnected(signal))
            return false;
        emit q->layerToggleVisibleRequested();
        return true;
    }
    return false;
}

// 显示隐藏的过渡：有人提供了实现，就让它创建动画并返回；没有就返回空，由调用方直接切到结束状态。
QAbstractAnimation *Ui::Private::createVisibility(int effect, QWidget *target, bool showing)
{
    switch (effect) {
    case 0: // PanelExpand
        if (auto *implementation = effects.panelExpand())
            return implementation->createTransition(target, showing);
        break;
    default:
        break;
    }
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

void Ui::setCanvasHostWidget(QWidget *widget)
{
    d->setExternal(QStringLiteral("canvasHost"), widget);
}

} // namespace vf
