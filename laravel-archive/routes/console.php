<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('about:dashboard', function () {
    $this->comment('PF-193 Mirzaobod monitoring platformasi');
})->purpose('Display the dashboard application name');
