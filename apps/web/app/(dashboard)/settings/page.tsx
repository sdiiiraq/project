import { OrganizationSettings } from '@/features/settings/organization-settings';

export const metadata = { title: 'الإعدادات' };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">الإعدادات</h2>
      <OrganizationSettings />
    </div>
  );
}
