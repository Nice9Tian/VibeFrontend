// 业务层：假的绘图区。真实项目里这里是 OpenGL 画板。
#pragma once

#include <QWidget>

class LayerModel;

class CanvasWidget : public QWidget
{
    Q_OBJECT

public:
    explicit CanvasWidget(LayerModel *model, QWidget *parent = nullptr);

protected:
    void paintEvent(QPaintEvent *event) override;

private:
    LayerModel *m_model;
};
