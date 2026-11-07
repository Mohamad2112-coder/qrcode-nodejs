/**
 * Socket.io service helpers for tenant/token room isolation.
 * Exposes functions to emit events to specific tenants and orders.
 */

export function createSocketService(io) {
  if (!io) {
    throw new Error('Socket.io instance is required');
  }

  /**
   * Emit an order event to all clients in a business room (tenant-scoped).
   */
  function toBusiness(business_id, event, data) {
    io.to(`business:${business_id}`).emit(event, {
      ...data,
      business_id,
      ts: new Date().toISOString(),
    });
  }

  /**
   * Emit an order event to clients tracking a specific order (public tracker room).
   */
  function toOrder(orderId, event, data) {
    io.to(`order:${orderId}`).emit(event, {
      ...data,
      orderId,
      ts: new Date().toISOString(),
    });
  }

  /**
   * Emit to a specific user.
   */
  function toUser(userId, event, data) {
    io.to(`user:${userId}`).emit(event, {
      ...data,
      userId,
      ts: new Date().toISOString(),
    });
  }

  /**
   * Broadcast order created to business room.
   */
  function broadcastOrderCreated(business_id, order) {
    toBusiness(business_id, 'order:created', order);
  }

  /**
   * Broadcast order status changed to business + order rooms.
   */
  function broadcastOrderStatusChanged(business_id, orderId, status, previousStatus, changedBy) {
    toBusiness(business_id, 'order:status_changed', {
      orderId, status, previousStatus, changedBy,
    });
    toOrder(orderId, 'order:status_changed', {
      orderId, status, previousStatus,
    });
    if (status === 'READY') {
      toBusiness(business_id, 'order:ready', { orderId });
      toOrder(orderId, 'order:ready', { orderId });
    }
  }

  /**
   * Broadcast a synced offline order to the business room.
   */
  function broadcastOrderSynced(business_id, order) {
    toBusiness(business_id, 'order:synced', order);
  }

  return {
    toBusiness,
    toOrder,
    toUser,
    broadcastOrderCreated,
    broadcastOrderStatusChanged,
    broadcastOrderSynced,
  };
}

export default { createSocketService };
