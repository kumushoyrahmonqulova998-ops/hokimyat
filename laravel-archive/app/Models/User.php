<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable
{
    use HasFactory;
    use Notifiable;
    use SoftDeletes;

    protected $fillable = [
        'mahalla_id',
        'name',
        'username',
        'email',
        'password',
        'is_active',
        'must_change_password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'must_change_password' => 'boolean',
        ];
    }

    public function mahalla(): BelongsTo
    {
        return $this->belongsTo(Mahalla::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    public function directions(): BelongsToMany
    {
        return $this->belongsToMany(Direction::class)
            ->withPivot(['can_view', 'can_update', 'can_review'])
            ->withTimestamps();
    }

    public function hasRole(string $role): bool
    {
        return $this->roles()->where('name', $role)->exists();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->roles()
            ->whereHas('permissions', fn ($query) => $query->where('name', $permission))
            ->exists();
    }

    public function canUpdateDirection(int $directionId): bool
    {
        return $this->hasPermission('indicator.update')
            && ($this->hasRole('super-admin')
                || $this->directions()->whereKey($directionId)->wherePivot('can_update', true)->exists());
    }

    public function canReviewDirection(int $directionId): bool
    {
        return $this->hasPermission('indicator.review')
            && ($this->hasRole('super-admin')
                || $this->directions()->whereKey($directionId)->wherePivot('can_review', true)->exists());
    }
}
