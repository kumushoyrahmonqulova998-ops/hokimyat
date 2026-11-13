<?php

namespace App\Actions;

use App\Models\Approval;
use App\Models\AuditLog;
use App\Models\Indicator;
use App\Models\IndicatorValue;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DecideIndicatorApproval
{
    public function __invoke(Approval $approval, User $reviewer, string $decision, ?string $comment = null): Approval
    {
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            throw ValidationException::withMessages(['decision' => 'Tasdiqlash qarori yaroqsiz.']);
        }

        if (!$reviewer->is_active || !$reviewer->hasPermission('indicator.review')) {
            abort(403, 'Ma’lumotlarni ko‘rib chiqish uchun ruxsat yo‘q.');
        }

        if ($reviewer->hasRole('mahalla')) {
            abort(403, 'Mahalla foydalanuvchisi ma’lumotni o‘zi tasdiqlay olmaydi.');
        }

        return DB::transaction(function () use ($approval, $reviewer, $decision, $comment): Approval {
            $lockedApproval = Approval::query()
                ->with('history.indicator')
                ->lockForUpdate()
                ->findOrFail($approval->id);

            if ($lockedApproval->status !== 'submitted') {
                throw ValidationException::withMessages(['approval' => 'Ushbu ma’lumot bo‘yicha qaror avval qabul qilingan.']);
            }

            $history = $lockedApproval->history;
            if (!$reviewer->canReviewDirection((int) $history->indicator->direction_id)) {
                abort(403, 'Ushbu yo‘nalishdagi ma’lumotlarni ko‘rib chiqish uchun ruxsat yo‘q.');
            }

            if ($decision === 'approved') {
                Indicator::query()->lockForUpdate()->findOrFail($history->indicator_id);
                $scopeKey = $history->mahalla_id === null
                    ? 'district'
                    : 'mahalla:'.$history->mahalla_id;
                $current = IndicatorValue::query()
                    ->where('indicator_id', $history->indicator_id)
                    ->where('scope_key', $scopeKey)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ((int) $current->value !== (int) $history->old_value) {
                    throw ValidationException::withMessages([
                        'approval' => 'Ko‘rsatkich yuborilgandan keyin o‘zgargan. Eskirgan ma’lumotni tasdiqlab bo‘lmaydi.',
                    ]);
                }

                $current->update([
                    'value' => $history->new_value,
                    'as_of_date' => $history->changed_at->toDateString(),
                ]);
            }

            $lockedApproval->update([
                'reviewed_by' => $reviewer->id,
                'status' => $decision,
                'decision_comment' => $comment,
                'reviewed_at' => now(),
            ]);

            AuditLog::query()->create([
                'user_id' => $reviewer->id,
                'event' => 'indicator.'.$decision,
                'subject_type' => Approval::class,
                'subject_id' => $lockedApproval->id,
                'metadata' => ['history_id' => $history->id],
                'created_at' => now(),
            ]);

            return $lockedApproval;
        });
    }
}
