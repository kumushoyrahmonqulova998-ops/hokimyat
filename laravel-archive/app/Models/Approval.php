<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Approval extends Model
{
    protected $fillable = [
        'indicator_history_id',
        'reviewed_by',
        'status',
        'decision_comment',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return ['reviewed_at' => 'immutable_datetime'];
    }

    public function history(): BelongsTo
    {
        return $this->belongsTo(IndicatorHistory::class, 'indicator_history_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
