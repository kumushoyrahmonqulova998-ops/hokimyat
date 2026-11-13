<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class CreateSuperAdmin extends Command
{
    protected $signature = 'app:create-super-admin
        {--name= : Super Adminning to‘liq ismi}
        {--username= : Kirish uchun login}
        {--email= : Ixtiyoriy email manzili}';

    protected $description = 'Birinchi Super Adminni xavfsiz, interaktiv tarzda yaratish';

    public function handle(): int
    {
        if (!Role::query()->where('name', 'super-admin')->exists()) {
            $this->error('Rollar topilmadi. Avval php artisan db:seed --class=DatabaseSeeder buyrug‘ini bajaring.');

            return self::FAILURE;
        }

        $name = trim((string) ($this->option('name') ?: $this->ask('To‘liq ism')));
        $username = trim((string) ($this->option('username') ?: $this->ask('Login')));
        $email = trim((string) $this->option('email'));
        $email = $email === '' ? null : $email;

        try {
            Validator::make(
                ['name' => $name, 'username' => $username, 'email' => $email],
                [
                    'name' => ['required', 'string', 'max:255'],
                    'username' => ['required', 'string', 'max:100', 'alpha_dash', 'unique:users,username'],
                    'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
                ],
            )->validate();
        } catch (ValidationException $exception) {
            foreach ($exception->errors() as $messages) {
                foreach ($messages as $message) {
                    $this->error($message);
                }
            }

            return self::FAILURE;
        }

        $password = $this->secret('Yangi parol (kamida 12 belgi)');
        $confirmation = $this->secret('Parolni qayta kiriting');

        if (!is_string($password) || !hash_equals($password, (string) $confirmation)) {
            $this->error('Parollar mos emas.');

            return self::FAILURE;
        }

        try {
            Validator::make(['password' => $password], [
                'password' => ['required', 'string', Password::min(12)->letters()->mixedCase()->numbers()],
            ])->validate();
        } catch (ValidationException $exception) {
            foreach ($exception->errors()['password'] ?? [] as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        DB::transaction(function () use ($name, $username, $email, $password): void {
            $user = User::query()->create([
                'name' => $name,
                'username' => $username,
                'email' => $email,
                'password' => $password,
                'is_active' => true,
                'must_change_password' => false,
            ]);
            $user->roles()->attach(Role::query()->where('name', 'super-admin')->firstOrFail());
        });

        $this->info('Super Admin yaratildi. Parol terminalda ko‘rsatilmaydi.');

        return self::SUCCESS;
    }
}
