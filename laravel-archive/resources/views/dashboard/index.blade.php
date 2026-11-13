@extends('layouts.app')

@section('content')
    <div class="page-heading">
        <div>
            <div class="eyebrow"><span class="eyebrow-line"></span> MIRZAOBOD TUMAN HOKIMLIGI · PF-193</div>
            <h1>{{ $activeSection === 'dashboard' ? 'Ijro holati va asosiy ko‘rsatkichlar' : $section['label'] }}</h1>
            <p class="page-description">
                @if ($activeSection === 'dashboard')
                    PF-193-son Farmoni doirasidagi vazifalar ijrosi bo‘yicha tahliliy ma’lumot.
                @else
                    Mirzaobod tumanida {{ mb_strtolower($section['label']) }} bo‘yicha jamlangan monitoring ma’lumotlari.
                @endif
            </p>
        </div>
        <div class="heading-actions">
            <span class="update-chip"><span class="status-dot"></span> Yig‘ma monitoring ma’lumotlari</span>
            @if ($activeSection === 'reports')
                <button class="button button-primary" type="button" data-print>Hisobotni chop etish</button>
            @endif
        </div>
    </div>

    @if ($activeSection === 'dashboard')
        <section class="summary-grid" aria-label="Asosiy ko‘rsatkichlar">
            @foreach ($metrics as $index => $item)
                <article class="summary-card accent-{{ $index + 1 }}">
                    <div class="summary-top"><span class="summary-label">{{ $item['label'] }}</span><span class="summary-icon">{{ ['◎', '⌂', '▤', '↗'][$index] }}</span></div>
                    <div class="summary-value">{{ $item['value'] }} <small>{{ $item['unit'] }}</small></div>
                    <div class="summary-foot">
                        @if ($item['rate'] !== null)
                            <span class="positive">{{ $item['rate'] }}%</span><span>ijro darajasi</span>
                        @else
                            <span class="muted">PF-193 monitoring doirasida</span>
                        @endif
                    </div>
                </article>
            @endforeach
        </section>

        <div class="section-title-row">
            <div><span class="eyebrow">USTUVOR YO‘NALISHLAR</span><h2>Ijro ko‘rsatkichlari</h2></div>
            <a class="text-link" href="{{ route('dashboard.section', ['section' => 'reports']) }}">Hisobotlar <span>→</span></a>
        </div>
        <section class="panel-grid">
            @foreach (['unemployment', 'businessLoans', 'preschool', 'medicalAid', 'socialRegistry', 'utilities'] as $key)
                @php
                    $cardMetrics = match ($key) {
                        'unemployment' => [
                            ['label' => 'Aniqlangan', 'value' => $data['unemployment']['totalIdentified']],
                            ['label' => 'Bandligi ta’minlangan', 'value' => $data['unemployment']['totalHelped']],
                        ],
                        'businessLoans' => [
                            ['label' => 'Aniqlangan', 'value' => $data['businessAndLoans']['totalIdentified']],
                            ['label' => 'Kredit olgan', 'value' => $data['businessAndLoans']['totalHelped']],
                        ],
                        'preschool' => [
                            ['label' => 'Ehtiyoj', 'value' => $data['preschool']['neededChildren']],
                            ['label' => 'Qamrab olingan', 'value' => $data['preschool']['enrolledChildren']],
                        ],
                        'medicalAid' => [
                            ['label' => 'Ehtiyoj', 'value' => $data['medicalAid']['needed']],
                            ['label' => 'Yordam olgan', 'value' => $data['medicalAid']['treated']],
                        ],
                        'socialRegistry' => [
                            ['label' => 'Oilalar', 'value' => $data['socialRegistry']['totalFamilies']],
                            ['label' => 'Fuqarolar', 'value' => $data['socialRegistry']['totalCitizens']],
                        ],
                        default => [
                            ['label' => 'Ehtiyoj', 'value' => $data['utilities']['needyFamilies']],
                            ['label' => 'Yordam olgan', 'value' => $data['utilities']['helpedFamilies']],
                        ],
                    };
                    $done = $cardMetrics[1]['value'];
                    $total = $cardMetrics[0]['value'];
                    $rate = $total > 0 ? (int) round(min(100, ($done / $total) * 100)) : 0;
                @endphp
                <a class="panel direction-card" href="{{ route('dashboard.section', ['section' => $key]) }}">
                    <div class="panel-heading"><span class="direction-icon">{{ $sections[$key]['icon'] }}</span><span class="panel-arrow">↗</span></div>
                    <h3>{{ $sections[$key]['label'] }}</h3>
                    <div class="direction-numbers">
                        <span><strong>{{ number_format($total, 0, ',', ' ') }}</strong><small>{{ $cardMetrics[0]['label'] }}</small></span>
                        <span><strong>{{ number_format($done, 0, ',', ' ') }}</strong><small>{{ $cardMetrics[1]['label'] }}</small></span>
                    </div>
                    @if ($key !== 'socialRegistry')
                        <div class="progress-label"><span>Ijro darajasi</span><strong>{{ $rate }}%</strong></div>
                        <div class="progress-track"><span style="width: {{ $rate }}%"></span></div>
                    @else
                        <div class="progress-label"><span>Reyestr bo‘yicha kuzatuv</span><strong>Ma’lumot</strong></div>
                    @endif
                </a>
            @endforeach
        </section>
    @elseif ($activeSection === 'dataManagement')
        <section class="panel data-panel">
            <div class="panel-heading panel-heading-spread">
                <div><span class="eyebrow">MA’LUMOTLARNI BOSHQARISH</span><h2>Ko‘rsatkichlarni tahrirlash</h2><p class="muted">O‘zgartirilgan qiymatlar ushbu brauzer seansida saqlanadi.</p></div>
                <div class="data-actions">
                    <a class="button button-secondary" href="{{ route('dashboard.export') }}">JSON yuklab olish</a>
                    <a class="button button-secondary" href="{{ route('dashboard.export.csv') }}">CSV yuklab olish</a>
                    <form class="import-form" action="{{ route('dashboard.import') }}" method="POST" enctype="multipart/form-data">
                        @csrf
                        <label class="button button-secondary" for="import-json">JSON import</label>
                        <input id="import-json" class="visually-hidden" type="file" name="file" accept=".json,application/json" required>
                        <button class="button button-primary" type="submit">Yuklash</button>
                    </form>
                    <form action="{{ route('dashboard.reset') }}" method="POST" data-confirm="Barcha o‘zgarishlar bekor qilinib, boshlang‘ich ma’lumotlar tiklansinmi?">
                        @csrf
                        <button class="button button-danger" type="submit">Boshlang‘ich holat</button>
                    </form>
                </div>
            </div>
            <div class="editable-grid">
                @foreach ($editableFields as $path => $label)
                    <form class="editable-field" action="{{ route('dashboard.update') }}" method="POST">
                        @csrf
                        <input type="hidden" name="path" value="{{ $path }}">
                        <label for="field-{{ $loop->index }}">{{ $label }}</label>
                        <div class="input-row">
                            <input id="field-{{ $loop->index }}" name="value" type="number" min="0" max="999999999999999" step="1" value="{{ data_get($data, $path) }}" required>
                            <button type="submit" class="save-button" aria-label="{{ $label }} qiymatini saqlash">Saqlash</button>
                        </div>
                    </form>
                @endforeach
            </div>
        </section>
    @elseif ($activeSection === 'settings')
        <section class="settings-grid">
            <article class="panel settings-panel">
                <span class="eyebrow">TIZIM PARAMETRLARI</span>
                <h2>Til va ko‘rinish</h2>
                <p class="muted">Tanlangan ko‘rinish va til brauzer seansi davomida saqlanadi.</p>
                <form action="{{ route('dashboard.settings') }}" method="POST" class="settings-form">
                    @csrf
                    <label for="language">Tizim tili</label>
                    <select id="language" name="language">
                        <option value="uz" @selected($language === 'uz')>O‘zbekcha (Lotin)</option>
                        <option value="uz_cyrl" @selected($language === 'uz_cyrl')>Ўзбекча (Кирилл)</option>
                        <option value="ru" @selected($language === 'ru')>Русский язык</option>
                    </select>
                    <label for="theme">Displey rejimi</label>
                    <select id="theme" name="theme">
                        <option value="dark" @selected($theme === 'dark')>Tungi rejim</option>
                        <option value="light" @selected($theme === 'light')>Kunduzgi rejim</option>
                    </select>
                    <button class="button button-primary" type="submit">Sozlamalarni saqlash</button>
                </form>
            </article>
            <article class="panel settings-panel legal-panel">
                <span class="eyebrow">HUQUQIY ASOS</span>
                <h2>PF-193 monitoring tizimi</h2>
                <p>Mazkur axborot-tahlil tizimi O‘zbekiston Respublikasi Prezidentining PF-193-son Farmoni ijrosini ta’minlash va Mirzaobod tumanida amalga oshirilayotgan ishlarni monitoring qilish uchun mo‘ljallangan.</p>
                <div class="legal-note"><span class="status-dot"></span> Kiritilgan ko‘rsatkichlar Laravel seansida saqlanadi.</div>
            </article>
        </section>
    @elseif ($activeSection === 'reports')
        <section class="panel report-panel" id="printable-report">
            <div class="panel-heading panel-heading-spread">
                <div><span class="eyebrow">RASMIY HISOBOT</span><h2>Mirzaobod tumani — PF-193 ijro ko‘rsatkichlari</h2><p class="muted">Hisobotni chop eting yoki ma’lumotlarni JSON formatida saqlang.</p></div>
                <button type="button" class="button button-primary no-print" data-print>Chop etish</button>
            </div>
            <div class="report-grid">
                @foreach ($sections as $key => $item)
                    @if (in_array($key, ['dashboard', 'reports', 'dataManagement', 'settings', 'otherServices'], true))
                        @continue
                    @endif
                    <div class="report-row"><span>{{ $item['label'] }}</span><a href="{{ route('dashboard.section', ['section' => $key]) }}">Ko‘rish →</a></div>
                @endforeach
            </div>
            <a class="button button-secondary no-print" href="{{ route('dashboard.export') }}">Barcha ma’lumotlarni JSON yuklab olish</a>
        </section>
    @elseif ($activeSection === 'socialRegistry')
        <section class="summary-grid">
            @foreach ($metrics as $item)
                <article class="summary-card"><div class="summary-top"><span class="summary-label">{{ $item['label'] }}</span><span class="summary-icon">▤</span></div><div class="summary-value">{{ $item['value'] }} <small>{{ $item['unit'] }}</small></div></article>
            @endforeach
        </section>
        <section class="panel table-panel">
            <div class="panel-heading"><div><span class="eyebrow">TOIFALAR KESIMIDA</span><h2>Ijtimoiy reyestr tarkibi</h2></div></div>
            <div class="table-wrap"><table><thead><tr><th>Toifa</th><th>Oilalar</th><th>Fuqarolar</th></tr></thead><tbody>
                <tr><td>Davlat ta’minotidagi</td><td>{{ number_format($data['socialRegistry']['categories']['stateSupport']['families'], 0, ',', ' ') }}</td><td>{{ number_format($data['socialRegistry']['categories']['stateSupport']['citizens'], 0, ',', ' ') }}</td></tr>
                <tr><td>Kambag‘al oilalar</td><td>{{ number_format($data['socialRegistry']['categories']['poor']['families'], 0, ',', ' ') }}</td><td>{{ number_format($data['socialRegistry']['categories']['poor']['citizens'], 0, ',', ' ') }}</td></tr>
                <tr><td>Kambag‘allik chegarasidagi</td><td>{{ number_format($data['socialRegistry']['categories']['nearPoverty']['families'], 0, ',', ' ') }}</td><td>{{ number_format($data['socialRegistry']['categories']['nearPoverty']['citizens'], 0, ',', ' ') }}</td></tr>
            </tbody></table></div>
        </section>
    @elseif ($activeSection === 'allocatedFunds')
        <section class="summary-grid">
            @foreach ($metrics as $index => $item)
                <article class="summary-card accent-{{ $index + 1 }}"><div class="summary-top"><span class="summary-label">{{ $item['label'] }}</span><span class="summary-icon">◉</span></div><div class="summary-value">{{ $item['value'] }} <small>{{ $item['unit'] }}</small></div></article>
            @endforeach
        </section>
        <section class="panel table-panel">
            <div class="panel-heading"><div><span class="eyebrow">MOLIYALASHTIRISH</span><h2>Mablag‘lar yo‘nalishlar bo‘yicha</h2></div></div>
            <div class="table-wrap"><table><thead><tr><th>Yo‘nalish</th><th>Ajratilgan mablag‘</th><th>Ulushi</th></tr></thead><tbody>
                @foreach ($data['allocatedFunds'] as $fund)
                    <tr><td>{{ $fund['name'] }}</td><td>{{ $fund['amount'] }}</td><td><span class="share-pill">{{ number_format($fund['share'], 2, ',', ' ') }}%</span></td></tr>
                @endforeach
            </tbody></table></div>
        </section>
    @elseif ($activeSection === 'enterpriseRehab')
        <section class="summary-grid">
            @foreach ($metrics as $index => $item)
                <article class="summary-card accent-{{ $index + 1 }}"><div class="summary-top"><span class="summary-label">{{ $item['label'] }}</span><span class="summary-icon">▥</span></div><div class="summary-value">{{ $item['value'] }} <small>{{ $item['unit'] }}</small></div></article>
            @endforeach
        </section>
        <section class="panel narrative-panel">
            <span class="eyebrow">KORXONANI SOG‘LOMLASHTIRISH</span>
            <h2>«ORCHID-BEAUTY» MChJ</h2>
            <p>Korxonaning muddati o‘tgan 48,2 mlrd so‘m kredit qarzdorligi bo‘yicha to‘lov jadvali uzaytirildi. Natijada mavjud 150 ish o‘rni saqlab qolindi va yangi ish o‘rinlari yaratish imkoniyati paydo bo‘ldi.</p>
        </section>
    @elseif ($activeSection === 'otherServices')
        <section class="panel help-panel">
            <span class="eyebrow">YORDAM MARKAZI</span>
            <h2>Platformadan foydalanish</h2>
            <p>Ko‘rsatkichlarni yangilash uchun “Ma’lumotlarni boshqarish” bo‘limidan foydalaning. O‘zgarishlar seans davomida saqlanadi.</p>
            <div class="help-actions"><a class="button button-primary" href="{{ route('dashboard.section', ['section' => 'dataManagement']) }}">Ma’lumotlarni tahrirlash</a><a class="button button-secondary" href="{{ route('dashboard.export') }}">JSON nusxasini olish</a></div>
        </section>
    @else
        <section class="summary-grid">
            @foreach ($metrics as $index => $item)
                <article class="summary-card accent-{{ ($index % 4) + 1 }}">
                    <div class="summary-top"><span class="summary-label">{{ $item['label'] }}</span><span class="summary-icon">{{ $section['icon'] }}</span></div>
                    <div class="summary-value">{{ $item['value'] }} <small>{{ $item['unit'] }}</small></div>
                    @if ($item['rate'] !== null)
                        <div class="progress-label"><span>Ijro darajasi</span><strong>{{ $item['rate'] }}%</strong></div>
                        <div class="progress-track"><span style="width: {{ $item['rate'] }}%"></span></div>
                    @endif
                </article>
            @endforeach
        </section>
        <section class="panel details-panel">
            <div class="panel-heading"><div><span class="eyebrow">TAHLILIY MA’LUMOT</span><h2>{{ $section['label'] }} bo‘yicha holat</h2></div><a class="button button-secondary" href="{{ route('dashboard.section', ['section' => 'dataManagement']) }}">Ko‘rsatkichlarni yangilash</a></div>
            <p class="muted">Keltirilgan raqamlar platformaning joriy monitoring ma’lumotlari asosida shakllantirilgan. Tahrirlash va saqlash uchun ma’lumotlar bazasi bo‘limiga o‘ting.</p>
        </section>
    @endif
@endsection
