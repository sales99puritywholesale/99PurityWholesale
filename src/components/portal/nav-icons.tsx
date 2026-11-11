import {
  BadgeCheck, BarChart3, BookOpen, Boxes, Building2, ClipboardList, Coins, CreditCard, Circle, KeyRound, LayoutDashboard, Mail, Package, Plug, Receipt, ScrollText, Settings, ShoppingCart, Store, Tags,
  Truck, User, UserCog, Users, type LucideIcon,
} from 'lucide-react';

/** One icon per navigation key (client and admin share the keys they have in common). Unknown keys get a neutral dot, so adding a module never breaks the nav. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  overview: LayoutDashboard, applications: ClipboardList, organizations: Building2, customers: Users, products: Package, pricing: Tags, orders: ShoppingCart, invoices: Receipt, fulfillment: Truck,
  inventory: Boxes, integrations: Plug, commissions: Coins, notifications: Mail, reports: BarChart3, settings: Settings, staff: UserCog, audit: ScrollText,
  shop: Store, billing: CreditCard, account: User, certificates: BadgeCheck, apiKeys: KeyRound, apiDocs: BookOpen,
};

export const navIcon = (key: string): LucideIcon => (Object.prototype.hasOwnProperty.call(ICONS, key) ? ICONS[key]! : Circle);
