<!doctype html>
<html lang="{{ $language === 'ru' ? 'ru' : 'uz' }}" class="{{ $theme === 'dark' ? 'theme-dark' : 'theme-light' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="description" content="Mirzaobod tumani PF-193 monitoring platformasi">
    <title>{{ $section['label'] }} — Mirzaobod PF-193</title>
    <link rel="stylesheet" href="{{ asset('css/dashboard.css') }}">
</head>
<body>
    <div class="app-shell">
        <div class="sidebar-backdrop" data-menu-close></div>
        <aside class="sidebar" id="sidebar">
            <a class="brand" href="{{ route('dashboard.section') }}">
                <span class="brand-mark" aria-hidden="true">MT</span>
                <span class="brand-copy">
                    <strong>Mirzaobod tumani</strong>
                    <small>Hokimlik axborot-tahlil tizimi</small>
                </span>
                <span class="brand-close" data-menu-close aria-label="Menyuni yopish">×</span>
            </a>
            <nav class="side-nav" aria-label="Asosiy menyu">
                @foreach (['ASOSIY', 'YO‘NALISHLAR', 'TIZIM'] as $group)
                    <div class="nav-group">
                        <div class="nav-caption">{{ $group }}</div>
                        @foreach ($sections as $key => $item)
                            @if ($item['group'] === $group)
                                <a class="nav-link {{ $activeSection === $key ? 'active' : '' }}"
                                   href="{{ $key === 'dashboard' ? route('dashboard.section') : route('dashboard.section', ['section' => $key]) }}"
                                   @if ($activeSection === $key) aria-current="page" @endif>
                                    <span class="nav-icon" aria-hidden="true">{{ $item['icon'] }}</span>
                                    <span class="nav-label">{{ $item['label'] }}</span>
                                    @if (in_array($key, ['unemployment', 'utilities'], true))
                                        <span class="nav-alert" title="E’tibor talab qiladi">!</span>
                                    @endif
                                </a>
                            @endif
                        @endforeach
                    </div>
                @endforeach
            </nav>
            <div class="sidebar-footer">
                <span class="status-dot"></span>
                <span>Tizim faol</span>
                <span class="version">v2.5</span>
            </div>
        </aside>

        <div class="main-column">
            <header class="topbar">
                <div class="topbar-leading">
                    <button class="icon-button menu-button" type="button" data-menu-open aria-label="Menyuni ochish">☰</button>
                    <div class="breadcrumbs"><span>PF-193 ijro monitoringi</span><span class="crumb-separator">/</span><strong>{{ $section['label'] }}</strong></div>
                </div>
                <div class="topbar-actions">
                    <span class="report-date">Hisobot sanasi <strong>{{ now()->format('d.m.Y') }}</strong></span>
                    <a class="icon-button export-button" href="{{ route('dashboard.export') }}" title="JSON ma’lumotlarni yuklab olish" aria-label="JSON ma’lumotlarni yuklab olish">↓</a>
                    <div class="profile-chip"><span class="avatar">MT</span><span><strong>Mirzaobod tumani</strong><small>Ishchi panel</small></span></div>
                </div>
            </header>

            <main class="content">
                @if (session('status'))
                    <div class="flash-message" role="status">{{ session('status') }}</div>
                @endif
                @if ($errors->any())
                    <div class="flash-message flash-error" role="alert">{{ $errors->first() }}</div>
                @endif
                @yield('content')
                <footer class="page-footer">
                    <span>PF-193 · Mirzaobod tumani axborot-tahlil platformasi</span>
                    <span>Ma’lumotlar seans davomida saqlanadi</span>
                </footer>
            </main>
        </div>
    </div>
    <script src="{{ asset('js/dashboard.js') }}" defer></script>
</body>
</html>
