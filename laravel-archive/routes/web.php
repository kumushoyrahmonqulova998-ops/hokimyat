<?php

use App\Http\Controllers\DashboardController;
use Illuminate\Support\Facades\Route;

Route::get('/dashboard/export', [DashboardController::class, 'export'])->name('dashboard.export');
Route::get('/dashboard/export/csv', [DashboardController::class, 'exportCsv'])->name('dashboard.export.csv');
Route::post('/dashboard/import', [DashboardController::class, 'import'])->name('dashboard.import');
Route::post('/dashboard/data', [DashboardController::class, 'update'])->name('dashboard.update');
Route::post('/dashboard/data/reset', [DashboardController::class, 'reset'])->name('dashboard.reset');
Route::post('/dashboard/settings', [DashboardController::class, 'saveSettings'])->name('dashboard.settings');
Route::get('/{section?}', [DashboardController::class, 'index'])
    ->where('section', '[A-Za-z]+')
    ->name('dashboard.section');
