<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Indicator extends Model
{
    protected $fillable = [
        'direction_id',
        'code',
        'name',
        'unit',
        'value_type',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function direction(): BelongsTo
    {
        return $this->belongsTo(Direction::class);
    }

    public function values(): HasMany
    {
        return $this->hasMany(IndicatorValue::class);
    }

    public function histories(): HasMany
    {
        return $this->hasMany(IndicatorHistory::class);
    }
}
