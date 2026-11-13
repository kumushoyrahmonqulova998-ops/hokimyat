<?php

namespace Database\Seeders;

use App\Models\Direction;
use App\Models\Indicator;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class MonitoringCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            'super-admin' => 'Super Admin',
            'admin-one' => 'Admin-1',
            'admin-two' => 'Admin-2',
            'mahalla' => 'Mahalla',
        ];

        foreach ($roles as $name => $label) {
            Role::query()->updateOrCreate(['name' => $name], ['label' => $label]);
        }

        $permissions = [
            'dashboard.view' => 'Dashboardni ko‘rish',
            'indicator.view' => 'Ko‘rsatkichlarni ko‘rish',
            'indicator.update' => 'Ko‘rsatkichlarni yangilash',
            'indicator.review' => 'Ko‘rsatkichlarni tasdiqlash',
            'reports.export' => 'Hisobotlarni eksport qilish',
            'imports.manage' => 'Importlarni boshqarish',
            'users.manage' => 'Foydalanuvchilarni boshqarish',
            'mahallas.manage' => 'Mahallalarni boshqarish',
            'settings.manage' => 'Tizim sozlamalarini boshqarish',
            'audit.view' => 'Audit tarixini ko‘rish',
        ];

        foreach ($permissions as $name => $label) {
            Permission::query()->updateOrCreate(['name' => $name], ['label' => $label]);
        }

        $rolePermissions = [
            'super-admin' => array_keys($permissions),
            'admin-one' => ['dashboard.view', 'indicator.view', 'indicator.update', 'indicator.review', 'reports.export', 'imports.manage'],
            'admin-two' => ['dashboard.view', 'indicator.view', 'indicator.review', 'reports.export'],
            'mahalla' => ['dashboard.view', 'indicator.view', 'indicator.update'],
        ];

        foreach ($rolePermissions as $roleName => $permissionNames) {
            $role = Role::query()->where('name', $roleName)->firstOrFail();
            $permissionIds = Permission::query()->whereIn('name', $permissionNames)->pluck('id');
            $role->permissions()->sync($permissionIds);
        }

        $directionOrder = 0;
        foreach (config('monitoring.directions', []) as $directionCode => $direction) {
            [$directionName, $indicators] = $direction;
            $direction = Direction::query()->updateOrCreate(
                ['code' => $directionCode],
                ['name' => $directionName, 'sort_order' => $directionOrder++, 'is_active' => true],
            );

            $indicatorOrder = 0;
            foreach ($indicators as $indicatorCode => $indicator) {
                [$indicatorName, $unit] = $indicator;
                Indicator::query()->updateOrCreate(
                    ['code' => $directionCode.'.'.$indicatorCode],
                    [
                        'direction_id' => $direction->id,
                        'name' => $indicatorName,
                        'unit' => $unit,
                        'value_type' => 'integer',
                        'sort_order' => $indicatorOrder++,
                        'is_active' => true,
                    ],
                );
            }
        }
    }
}
