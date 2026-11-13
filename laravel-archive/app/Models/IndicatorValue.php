<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IndicatorValue extends Model
{
    protected $fillable = [
        'indicator_id',
        'mahalla_id',
        'scope_key',
        'value',
        'as_of_date',
    ];

    protected function casts(): array
    {
        return [
            'value' => 'integer',
            'as_of_date' => 'date',
        ];
    }

    public function indicator(): BelongsTo
    {
        return $this->belongsTo(Indicator::class);
    }

    public function mahalla(): BelongsTo
    {
        return $this->belongsTo(Mahalla::class);
    }
}
