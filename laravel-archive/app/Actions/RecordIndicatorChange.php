<?php

namespace App\Actions;

use App\Models\Approval;
use App\Models\AuditLog;
use App\Models\Indicator;
use App\Models\IndicatorHistory;
use App\Models\IndicatorValue;
use App\Models\Mahalla;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RecordIndicatorChange
{
    private const MAX_VALUE = 999999999999999;

    public function __invoke(
        Indicator $indicator,
        User $actor,
        ?Mahalla $mahalla,
        int $newValue,
        string $source,
        ?string $comment = null,
    ): IndicatorHistory {
        if ($newValue < 0 || $newValue > self::MAX_VALUE) {
            throw ValidationException::withMessages([
                'value' => 'Ko‘rsatkich noldan katta yoki teng, ruxsat etilgan chegarada bo‘lishi kerak.',
            ]);
        }

        if (!in_array($source, ['manual', 'json_import', 'csv_import', 'excel_import', 'correction'], true)) {
            throw ValidationException::withMessages(['source' => 'Ma’lumot manbasi yaroqsiz.']);
        }

        if (!$actor->is_active || !$indicator->is_active || ($mahalla && !$mahalla->is_active)) {
            throw ValidationException::withMessages(['value' => 'Faol bo‘lmagan hisob yoki ko‘rsatkich yangilanmaydi.']);
        }

        if ($actor->mahalla_id !== null && (int) $actor->mahalla_id !== (int) ($mahalla?->id ?? 0)) {
            abort(403, 'Foydalanuvchi faqat biriktirilgan mahalla ma’lumotlarini o‘zgartira oladi.');
        }

        if (!$actor->canUpdateDirection((int) $indicator->direction_id)) {
            abort(403, 'Ushbu yo‘nalishdagi ko‘rsatkichlarni yangilash uchun ruxsat yo‘q.');
        }

        return DB::transaction(function () use ($indicator, $actor, $mahalla, $newValue, $source, $comment): IndicatorHistory {
            $lockedIndicator = Indicator::query()->lockForUpdate()->findOrFail($indicator->id);
            $scopeKey = $mahalla ? 'mahalla:'.$mahalla->id : 'district';
            $current = IndicatorValue::query()->firstOrCreate(
                ['indicator_id' => $lockedIndicator->id, 'scope_key' => $scopeKey],
                [
                    'mahalla_id' => $mahalla?->id,
                    'value' => 0,
                    'as_of_date' => now()->toDateString(),
                ],
            );
            $current->refresh();
            $oldValue = (int) $current->value;
            $difference = $newValue - $oldValue;
            $changePercent = $oldValue === 0 ? 0 : round(($difference / $oldValue) * 100, 2);
            $isMahallaSubmission = $actor->hasRole('mahalla');
            $approvalStatus = $isMahallaSubmission ? 'submitted' : 'approved';

            $history = IndicatorHistory::query()->create([
                'indicator_id' => $lockedIndicator->id,
                'mahalla_id' => $mahalla?->id,
                'changed_by' => $actor->id,
                'old_value' => $oldValue,
                'new_value' => $newValue,
                'difference' => $difference,
                'change_percent' => $changePercent,
                'source' => $source,
                'approval_status' => $approvalStatus,
                'comment' => $comment,
                'changed_at' => now(),
            ]);

            if ($isMahallaSubmission) {
                Approval::query()->create([
                    'indicator_history_id' => $history->id,
                    'status' => 'submitted',
                ]);
            } else {
                $current->update([
                    'mahalla_id' => $mahalla?->id,
                    'value' => $newValue,
                    'as_of_date' => now()->toDateString(),
                ]);
            }

            AuditLog::query()->create([
                'user_id' => $actor->id,
                'event' => $isMahallaSubmission ? 'indicator.submitted' : 'indicator.updated',
                'subject_type' => IndicatorHistory::class,
                'subject_id' => $history->id,
                'metadata' => [
                    'indicator_id' => $lockedIndicator->id,
                    'mahalla_id' => $mahalla?->id,
                    'source' => $source,
                ],
                'created_at' => now(),
            ]);

            return $history;
        });
    }
}
