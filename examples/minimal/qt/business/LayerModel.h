// 业务层：一个假的数据模型，只有“图层是否可见”这一项。
#pragma once

#include <QObject>

class LayerModel : public QObject
{
    Q_OBJECT

public:
    using QObject::QObject;

    bool visible() const { return m_visible; }
    void setVisible(bool visible);

    // 被改了多少次。自测时用来确认一次点击只改了一次。
    int changeCount() const { return m_changeCount; }

signals:
    void visibleChanged(bool visible);

private:
    bool m_visible = true;
    int m_changeCount = 0;
};
