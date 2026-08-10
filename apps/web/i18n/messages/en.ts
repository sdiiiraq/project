import type { Messages } from './ar';
/** دعم الإنجليزية (§100) — هيكل مطابق للعربية. */
export const en: Messages = {
  common: {
    appName: 'Generator Management System', save: 'Save', cancel: 'Cancel', confirm: 'Confirm',
    delete: 'Delete', edit: 'Edit', create: 'Create', search: 'Search', filter: 'Filter',
    loading: 'Loading...', noData: 'No data', error: 'An error occurred', retry: 'Retry',
    actions: 'Actions', status: 'Status', date: 'Date', amount: 'Amount', total: 'Total',
    logout: 'Logout', settings: 'Settings',
  },
  auth: {
    login: 'Login', phone: 'Phone number', password: 'Password', forgotPassword: 'Forgot password?',
    resetPassword: 'Reset password', newPassword: 'New password', loginError: 'Invalid credentials',
    sessionExpired: 'Session expired, please log in again',
  },
  nav: {
    dashboard: 'Dashboard', generators: 'Generators', customers: 'Customers', subscriptions: 'Subscriptions',
    billing: 'Billing', collections: 'Collections', payments: 'Payments', expenses: 'Expenses',
    fuel: 'Fuel', maintenance: 'Maintenance', operations: 'Operations', employees: 'Employees',
    reports: 'Reports', notifications: 'Notifications', audit: 'Audit Log', users: 'Users & Roles',
  },
  dashboard: {
    totalBilled: 'Total Billed', totalCollected: 'Total Collected', outstanding: 'Outstanding',
    overdue: 'Overdue', expenses: 'Expenses', netProfit: 'Est. Net Profit',
    cashCollected: 'Cash Collected Today', activeSubscribers: 'Active Subscribers',
  },
  offline: {
    online: 'Online', offline: 'Offline', syncing: 'Syncing', pending: 'Pending sync',
    synced: 'Synced', failed: 'Failed', conflict: 'Conflict',
    paymentRecordedLocally: 'Transaction recorded locally, awaiting sync.',
  },
  empty: { noCustomers: 'No customers yet', noPayments: 'No payments in the selected period', noOutstanding: 'No outstanding debts' },
};
