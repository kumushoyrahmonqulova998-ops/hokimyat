<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class IndicatorHistory extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'indicator_id',
        'mahalla_id',
        'changed_by',
        'old_value',
        'new_value',
        'difference',
        'change_percent',
        'source',
        'approval_status',
        'comment',
        'changed_at',
    ];

    protected function casts(): array
    {
        return [
            'old_value' => 'integer',
            'new_value' => 'integer',
            'difference' => 'integer',
            'change_percent' => 'decimal:2',
            'changed_at' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(static function (): never {
            throw new LogicException('Indicator history is append-only.');
        });

        static::deleting(static function (): never {
            throw new LogicException('Indicator history is append-only.');
        });
    }

    public function indicator(): BelongsTo
    {
        return $this->belongsTo(Indicator::class);
    }

    public function mahalla(): BelongsTo
    {
        return $this->belongsTo(Mahalla::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }

    public function approval(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Approval::class);
    }
}
