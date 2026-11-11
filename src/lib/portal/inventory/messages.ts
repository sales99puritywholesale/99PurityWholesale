// Pure module (no server imports): safe, user-facing copy for P7 result codes. Never echoes database messages.
export const INVENTORY_MESSAGES: Readonly<Record<string, string>> = {
  no_warehouse: 'No warehouse is set up yet. Please contact your account manager.',
  receipt_not_found: 'Inbound shipment not found.',
  location_not_found: 'Choose an active location of the receiving warehouse.',
  below_reserved: 'That correction would take stock below what is already reserved for orders.',
  insufficient_stock: 'There is not enough available stock to allocate every line. An exception was opened for this order.',
  sandbox_order: 'Sandbox orders are only for testing and cannot be processed.',
  order_not_found: 'Order not found.',
  duplicate_code: 'That code is already in use.',
};
