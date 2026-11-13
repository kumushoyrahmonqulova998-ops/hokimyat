<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mahallas', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 64)->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('mahalla_id')->nullable()->constrained('mahallas')->nullOnDelete();
            $table->string('name');
            $table->string('username', 100)->unique();
            $table->string('email')->nullable()->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->boolean('is_active')->default(true);
            $table->boolean('must_change_password')->default(false);
            $table->rememberToken();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['mahalla_id', 'is_active']);
        });

        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        Schema::create('roles', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 64)->unique();
            $table->string('label');
            $table->timestamps();
        });

        Schema::create('permissions', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('label');
            $table->timestamps();
        });

        Schema::create('permission_role', function (Blueprint $table): void {
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->primary(['permission_id', 'role_id']);
        });

        Schema::create('role_user', function (Blueprint $table): void {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->primary(['user_id', 'role_id']);
        });

        Schema::create('directions', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 64)->unique();
            $table->string('name');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('indicators', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('direction_id')->constrained()->restrictOnDelete();
            $table->string('code', 100)->unique();
            $table->string('name');
            $table->string('unit', 64);
            $table->string('value_type', 24)->default('integer');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['direction_id', 'is_active']);
        });

        Schema::create('direction_user', function (Blueprint $table): void {
            $table->foreignId('direction_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('can_view')->default(false);
            $table->boolean('can_update')->default(false);
            $table->boolean('can_review')->default(false);
            $table->timestamps();
            $table->primary(['direction_id', 'user_id']);
        });

        Schema::create('indicator_values', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('indicator_id')->constrained()->restrictOnDelete();
            $table->foreignId('mahalla_id')->nullable()->constrained('mahallas')->restrictOnDelete();
            $table->string('scope_key', 80);
            $table->unsignedBigInteger('value')->default(0);
            $table->date('as_of_date');
            $table->timestamps();
            $table->unique(['indicator_id', 'scope_key']);
            $table->index(['mahalla_id', 'as_of_date']);
        });

        Schema::create('indicator_histories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('indicator_id')->constrained()->restrictOnDelete();
            $table->foreignId('mahalla_id')->nullable()->constrained('mahallas')->restrictOnDelete();
            $table->foreignId('changed_by')->constrained('users')->restrictOnDelete();
            $table->unsignedBigInteger('old_value');
            $table->unsignedBigInteger('new_value');
            $table->bigInteger('difference');
            $table->decimal('change_percent', 20, 2)->default(0);
            $table->string('source', 24);
            $table->string('approval_status', 24);
            $table->text('comment')->nullable();
            $table->timestampTz('changed_at')->useCurrent();
            $table->index(['indicator_id', 'mahalla_id', 'changed_at'], 'indicator_history_scope_date_idx');
            $table->index(['approval_status', 'changed_at']);
        });

        Schema::create('approvals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('indicator_history_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('status', 24)->default('submitted');
            $table->text('decision_comment')->nullable();
            $table->timestampTz('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });

        Schema::create('data_imports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('direction_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('file_name');
            $table->string('format', 16);
            $table->string('status', 24);
            $table->unsignedInteger('successful_rows')->default(0);
            $table->unsignedInteger('failed_rows')->default(0);
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('data_import_rows', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('data_import_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('row_number');
            $table->json('row_data');
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->index(['data_import_id', 'row_number']);
        });

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event', 100);
            $table->string('subject_type', 100)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('metadata')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestampTz('created_at')->useCurrent();
            $table->index(['subject_type', 'subject_id']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('system_settings', function (Blueprint $table): void {
            $table->string('key')->primary();
            $table->json('value');
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['notifiable_type', 'notifiable_id', 'read_at'], 'notifications_unread_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('data_import_rows');
        Schema::dropIfExists('data_imports');
        Schema::dropIfExists('approvals');
        Schema::dropIfExists('indicator_histories');
        Schema::dropIfExists('indicator_values');
        Schema::dropIfExists('direction_user');
        Schema::dropIfExists('indicators');
        Schema::dropIfExists('directions');
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('permission_role');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
        Schema::dropIfExists('mahallas');
    }
};
