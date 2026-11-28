export type DashboardData = {
  totalSales: number;
  revenue: number;
  orders: number;
  pendingOrders: number;
  products: number;
  lowStockCount: number;
  customers: number;
  averageOrderValue: number;
  revenueLast30: number;
  revenuePrevious30: number;
  salesTrend: { date: string; revenue: number; orders: number }[];
  topProducts: ProductPerformance[];
  recentTransactions: {
    type: string;
    reference: string;
    counterparty: string;
    amount: number;
    status: string;
    at: string;
  }[];
  alerts: { level: string; title: string; detail?: string | null; action?: string | null }[];
  currencyCode: string;
  generatedAtUtc: string;
};

export type ProductListItem = {
  id: string;
  name: string;
  sku: string;
  categoryName?: string | null;
  brandName?: string | null;
  status: string;
  price: number;
  costPrice: number;
  stock: number;
  reserved: number;
  currencyCode: string;
  imageUrl?: string | null;
  isFeatured: boolean;
};

export type Variant = {
  id: string;
  name: string;
  sku: string;
  attributesJson?: string | null;
  price: number;
  costPrice: number;
  isActive: boolean;
  isDefault: boolean;
  onHand: number;
  reserved: number;
};

export type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription?: string | null;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  status: string;
  costPrice: number;
  basePrice: number;
  compareAtPrice?: number | null;
  taxRate: number;
  currencyCode: string;
  isFeatured: boolean;
  tags?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  variants: Variant[];
  images: string[];
  totalOnHand: number;
  totalReserved: number;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  productCount: number;
};

export type StockRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  reorderQuantity: number;
  costPrice: number;
  price: number;
};

export type PriceChange = {
  variantId: string;
  variantName: string;
  sku: string;
  oldPrice: number;
  newPrice: number;
  reason?: string | null;
  changedBy?: string | null;
  changedAtUtc: string;
};

export type Warehouse = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
  variantCount: number;
  unitsOnHand: number;
};

export type StockMovement = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  variantId: string;
  productName: string;
  sku: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  reference?: string | null;
  note?: string | null;
  createdAtUtc: string;
};

export type OrderListItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: number;
  currencyCode: string;
  itemCount: number;
  placedAtUtc: string;
};

export type OrderItem = {
  id: string;
  variantId?: string | null;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  customerId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  grandTotal: number;
  paidTotal: number;
  refundedTotal: number;
  currencyCode: string;
  couponCode?: string | null;
  shippingAddressJson?: string | null;
  notes?: string | null;
  source?: string | null;
  externalOrderId?: string | null;
  placedAtUtc: string;
  confirmedAtUtc?: string | null;
  shippedAtUtc?: string | null;
  deliveredAtUtc?: string | null;
  cancelledAtUtc?: string | null;
  items: OrderItem[];
  events: { id: string; type: string; message?: string | null; createdAtUtc: string }[];
  payments: { id: string; amount: number; method: string; status: string; paidAtUtc: string; reference?: string | null }[];
  refunds: { id: string; amount: number; reason: string; status: string; processedAtUtc: string }[];
  returns: {
    id: string;
    reason: string;
    status: string;
    refundAmount: number;
    createdAtUtc: string;
    processedAtUtc?: string | null;
  }[];
  invoice?: { id: string; invoiceNumber: string; issuedAtUtc: string; dueAtUtc: string; amount: number; status: string } | null;
};

export type CustomerListItem = {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  isBusiness: boolean;
  tags?: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAtUtc?: string | null;
  externalSource?: string | null;
};

export type Address = {
  id: string;
  type: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
};

export type CustomerDetail = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  notes?: string | null;
  tags?: string | null;
  isBusiness: boolean;
  externalSource?: string | null;
  externalId?: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAtUtc?: string | null;
  addresses: Address[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    grandTotal: number;
    currencyCode: string;
    placedAtUtc: string;
  }[];
  createdAtUtc: string;
};

export type Offer = {
  id: string;
  name: string;
  type: string;
  value: number;
  startsAtUtc: string;
  endsAtUtc: string;
  isActive: boolean;
  isLive: boolean;
  appliesToAllProducts: boolean;
  productId?: string | null;
  productName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  minQuantity: number;
};

export type Coupon = {
  id: string;
  code: string;
  type: string;
  value: number;
  minOrderSubtotal: number;
  startsAtUtc: string;
  endsAtUtc: string;
  isActive: boolean;
  isLive: boolean;
  maxRedemptions?: number | null;
  redemptionCount: number;
};

export type OfferBundle = { active: Offer[]; all: Offer[]; coupons: Coupon[] };

export type Supplier = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  openPurchaseOrders: number;
  totalPurchased: number;
};

export type PurchaseOrderListItem = {
  id: string;
  poNumber: string;
  supplierName: string;
  status: string;
  orderDateUtc: string;
  expectedDateUtc?: string | null;
  total: number;
  amountPaid: number;
};

export type PurchaseOrderItem = {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
};

export type PurchaseOrderDetail = {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  orderDateUtc: string;
  expectedDateUtc?: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  currencyCode: string;
  notes?: string | null;
  items: PurchaseOrderItem[];
  receipts: { id: string; receivedAtUtc: string; warehouseId: string; notes?: string | null }[];
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId?: string | null;
  amount: number;
  method: string;
  reference?: string | null;
  paidAtUtc: string;
};

export type FinanceSummary = {
  revenue: number;
  refunds: number;
  expenses: number;
  netRevenue: number;
  receivables: number;
  payables: number;
  cashCollected: number;
  byMethod: { method: string; amount: number }[];
  daily: { date: string; revenue: number; expenses: number }[];
};

export type Payment = {
  id: string;
  orderId?: string | null;
  orderNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  direction: string;
  method: string;
  amount: number;
  currencyCode: string;
  status: string;
  reference?: string | null;
  notes?: string | null;
  paidAtUtc: string;
};

export type Refund = {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  reason: string;
  status: string;
  processedAtUtc: string;
};

export type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  paidAtUtc: string;
  method: string;
  reference?: string | null;
};

export type SalesReport = {
  grossSales: number;
  netSales: number;
  discounts: number;
  tax: number;
  shipping: number;
  refunds: number;
  orderCount: number;
  averageOrderValue: number;
  trend: { date: string; revenue: number; orders: number }[];
  byStatus: { status: string; count: number }[];
  byPaymentStatus: { status: string; count: number }[];
  from: string;
  to: string;
};

export type ProductPerformance = {
  productId: string;
  name: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  profit: number;
};

export type CustomerReport = {
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  averageLifetimeValue: number;
  trend: { period: string; newCustomers: number; orders: number; revenue: number }[];
  from: string;
  to: string;
};

export type StockReportRow = {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  costPrice: number;
  price: number;
  stockValue: number;
  lowStock: boolean;
};

export type CompanySettings = {
  tenantId: string;
  companyName: string;
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  currencyCode: string;
  timeZone: string;
  status: string;
  apiContractVersion: string;
  createdAtUtc: string;
};

export type TeamMember = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLoginAtUtc?: string | null;
  createdAtUtc: string;
};

export type TaxRate = {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
  isInclusive: boolean;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAtUtc: string;
};

export type IntegrationStatus = {
  provisioningConfigured: boolean;
  connected: boolean;
  hostPlatform: string;
  status: string;
  connectionId?: string | null;
  workspaceId: string;
  workspaceName: string;
  hostCustomerId?: string | null;
  hostProjectId?: string | null;
  webhookUrl?: string | null;
  apiContractVersion: string;
  lastConnectedAtUtc?: string | null;
  lastEventDeliveredAtUtc?: string | null;
  lastError?: string | null;
  activeApiKeys: number;
  pendingEvents: number;
  failedDeliveries: number;
  provisionedAtUtc?: string | null;
};

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isRevoked: boolean;
  lastUsedAtUtc?: string | null;
  createdAtUtc: string;
};

export type CreatedApiKey = { client: ApiKey; key: string };

export type OutboxEvent = {
  id: string;
  tenantId: string;
  workspaceId: string;
  type: string;
  version: number;
  occurredAtUtc: string;
  subjectId: string;
  payloadJson: string;
  status: string;
  attempts: number;
  nextAttemptAtUtc: string;
  deliveredAtUtc?: string | null;
  lastError?: string | null;
};

export type DeliveryLog = {
  id: string;
  outboxEventId: string;
  eventType: string;
  attempt: number;
  success: boolean;
  statusCode?: number | null;
  error?: string | null;
  durationMs: number;
  createdAtUtc: string;
};

export type WorkspaceOption = {
  id?: string;
  workspaceId?: string;
  name: string;
  companyName?: string;
  tenantName?: string;
  role: string;
  currencyCode: string;
  isPrimary: boolean;
};

export type PriceQuoteResponse = {
  quote: {
    variantId: string;
    listPrice: number;
    unitPrice: number;
    offerDiscount: number;
    offerName?: string | null;
    currencyCode: string;
  };
  coupon?: {
    id: string;
    code: string;
    discountAmount: number;
    type: string;
    value: number;
  } | null;
};

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  issuedAtUtc: string;
  dueAtUtc: string;
  amount: number;
  status: string;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};
