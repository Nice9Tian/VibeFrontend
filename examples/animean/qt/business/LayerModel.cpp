#include "LayerModel.h"

void LayerModel::setVisible(bool visible)
{
    if (m_visible == visible)
        return;
    m_visible = visible;
    ++m_changeCount;
    emit visibleChanged(visible);
}
