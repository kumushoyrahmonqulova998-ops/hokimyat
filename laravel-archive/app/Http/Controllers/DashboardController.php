<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use JsonException;

class DashboardController extends Controller
{
    private const SECTIONS = [
        'dashboard' => ['label' => 'Bosh sahifa', 'group' => 'ASOSIY', 'icon' => '⌂'],
        'demographics' => ['label' => 'Aholi demografiyasi', 'group' => 'YO‘NALISHLAR', 'icon' => '◉'],
        'socialRegistry' => ['label' => 'Ijtimoiy reyestr', 'group' => 'YO‘NALISHLAR', 'icon' => '▤'],
        'unemployment' => ['label' => 'Ishsizlik va bandlik', 'group' => 'YO‘NALISHLAR', 'icon' => '↗'],
        'businessLoans' => ['label' => 'Tadbirkorlik va kreditlar', 'group' => 'YO‘NALISHLAR', 'icon' => '◈'],
        'informalEmployment' => ['label' => 'Norasmiy bandlik', 'group' => 'YO‘NALISHLAR', 'icon' => '◌'],
        'subsidies' => ['label' => 'Subsidiyalar va ko‘mak', 'group' => 'YO‘NALISHLAR', 'icon' => '◇'],
        'vocationalTraining' => ['label' => 'Kasb-hunarga o‘qitish', 'group' => 'YO‘NALISHLAR', 'icon' => '▱'],
        'preschool' => ['label' => 'Maktabgacha ta’lim (MTT)', 'group' => 'YO‘NALISHLAR', 'icon' => '◎'],
        'medicalAid' => ['label' => 'Tibbiy yordam', 'group' => 'YO‘NALISHLAR', 'icon' => '✚'],
        'housingCadastre' => ['label' => 'Uy-joy va kadastr', 'group' => 'YO‘NALISHLAR', 'icon' => '⌂'],
        'materialAid' => ['label' => 'Moddiy yordam', 'group' => 'YO‘NALISHLAR', 'icon' => '▣'],
        'utilities' => ['label' => 'Kommunal to‘lovlar', 'group' => 'YO‘NALISHLAR', 'icon' => 'ϟ'],
        'enterpriseRehab' => ['label' => '«ORCHID-BEAUTY» korxonasi', 'group' => 'YO‘NALISHLAR', 'icon' => '▥'],
        'allocatedFunds' => ['label' => 'Ajratilgan mablag‘lar', 'group' => 'YO‘NALISHLAR', 'icon' => '◉'],
        'reports' => ['label' => 'Hisobotlar va blankalar', 'group' => 'TIZIM', 'icon' => '▧'],
        'dataManagement' => ['label' => 'Ma’lumotlarni boshqarish', 'group' => 'TIZIM', 'icon' => '▦'],
        'settings' => ['label' => 'Sozlamalar', 'group' => 'TIZIM', 'icon' => '⚙'],
        'otherServices' => ['label' => 'Yordam markazi', 'group' => 'TIZIM', 'icon' => '?'],
    ];

    private const EDITABLE_FIELDS = [
        'demographics.familiesCount' => 'Jami oilalar soni',
        'demographics.totalPopulation' => 'Jami aholi soni',
        'demographics.womenCount' => 'Ayollar soni',
        'demographics.menCount' => 'Erkaklar soni',
        'demographics.minorsCount' => 'Voyaga yetmaganlar soni',
        'demographics.youthCount' => 'Yoshlar soni',
        'socialRegistry.totalFamilies' => 'Reyestrdagi jami oilalar',
        'socialRegistry.totalCitizens' => 'Reyestrdagi jami fuqarolar',
        'socialRegistry.categories.poor.families' => 'Kambag‘al oilalar',
        'socialRegistry.categories.poor.citizens' => 'Kambag‘al fuqarolar',
        'socialRegistry.categories.stateSupport.families' => 'Davlat ta’minotidagi oilalar',
        'socialRegistry.categories.stateSupport.citizens' => 'Davlat ta’minotidagi fuqarolar',
        'socialRegistry.categories.nearPoverty.families' => 'Kambag‘allik chegarasidagi oilalar',
        'socialRegistry.categories.nearPoverty.citizens' => 'Kambag‘allik chegarasidagi fuqarolar',
        'unemployment.totalIdentified' => 'Aniqlangan ishsizlar',
        'unemployment.totalHelped' => 'Bandligi ta’minlanganlar',
        'businessAndLoans.totalIdentified' => 'Tadbirkorlik istagidagilar',
        'businessAndLoans.totalHelped' => 'Kredit olganlar',
        'businessAndLoans.allocatedAmount' => 'Kredit mablag‘i (so‘m)',
        'informalEmployment.totalIdentified' => 'Aniqlangan norasmiy bandlar',
        'informalEmployment.totalHelped' => 'Rasmiy band qilganlar',
        'subsidiesAndLoans.totalIdentified' => 'Ko‘makka muhtoj fuqarolar',
        'subsidiesAndLoans.totalHelped' => 'Ko‘mak olganlar',
        'vocationalTraining.totalIdentified' => 'Kasb o‘rganishga muhtojlar',
        'vocationalTraining.totalHelped' => 'O‘qishga yuborilganlar',
        'preschool.neededChildren' => 'MTTga muhtoj bolalar',
        'preschool.enrolledChildren' => 'MTTga qamrab olinganlar',
        'medicalAid.needed' => 'Tibbiy yordamga muhtojlar',
        'medicalAid.treated' => 'Davolangan fuqarolar',
        'housingRepair.neededHouses' => 'Ta’mirga muhtoj uylar',
        'housingRepair.helpedFamilies' => 'Yordam olgan oilalar',
        'cadastre.neededHouses' => 'Kadastrga muhtoj uylar',
        'cadastre.formalized' => 'Rasmiylashtirilgan kadastrlar',
        'materialAid.needyFamilies' => 'Moddiy yordamga muhtoj oilalar',
        'materialAid.helpedFamilies' => 'Moddiy yordam olgan oilalar',
        'utilities.needyFamilies' => 'Kommunal yordamga muhtoj oilalar',
        'utilities.helpedFamilies' => 'Kommunal yordami qoplanganlar',
    ];

    public function index(Request $request, ?string $section = 'dashboard'): View
    {
        $section = array_key_exists($section, self::SECTIONS) ? $section : 'dashboard';
        $data = $request->session()->get('dashboard_data', $this->defaultData());
        $data = array_replace_recursive($this->defaultData(), $data);
        $metrics = $this->metricsFor($section, $data);

        return view('dashboard.index', [
            'sections' => self::SECTIONS,
            'activeSection' => $section,
            'section' => self::SECTIONS[$section],
            'data' => $data,
            'metrics' => $metrics,
            'editableFields' => self::EDITABLE_FIELDS,
            'theme' => $request->session()->get('dashboard_theme', 'light'),
            'language' => $request->session()->get('dashboard_language', 'uz'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'path' => ['required', 'string', Rule::in(array_keys(self::EDITABLE_FIELDS))],
            'value' => ['required', 'integer', 'min:0', 'max:999999999999999'],
        ]);

        $data = array_replace_recursive(
            $this->defaultData(),
            $request->session()->get('dashboard_data', [])
        );
        Arr::set($data, $validated['path'], (int) $validated['value']);
        $request->session()->put('dashboard_data', $data);
        $request->session()->flash('status', 'Ma’lumot muvaffaqiyatli saqlandi.');

        return to_route('dashboard.section', ['section' => 'dataManagement']);
    }

    public function reset(Request $request): RedirectResponse
    {
        $request->session()->forget('dashboard_data');
        $request->session()->flash('status', 'Boshlang‘ich ma’lumotlar tiklandi.');

        return to_route('dashboard.section', ['section' => 'dataManagement']);
    }

    public function export(Request $request)
    {
        $data = array_replace_recursive(
            $this->defaultData(),
            $request->session()->get('dashboard_data', [])
        );

        return response()->streamDownload(
            static fn () => print json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
            'mirzaobod-pf193-ma-lumotlar.json',
            ['Content-Type' => 'application/json; charset=UTF-8']
        );
    }

    public function exportCsv(Request $request)
    {
        $data = array_replace_recursive(
            $this->defaultData(),
            $request->session()->get('dashboard_data', [])
        );

        return response()->streamDownload(static function () use ($data): void {
            $output = fopen('php://output', 'wb');
            if ($output === false) {
                throw new \RuntimeException('CSV oqimini ochib bo‘lmadi.');
            }

            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['Ko‘rsatkich', 'Qiymat'], ';', '"', '');
            foreach (self::EDITABLE_FIELDS as $path => $label) {
                fputcsv($output, [$label, Arr::get($data, $path)], ';', '"', '');
            }
            fclose($output);
        }, 'mirzaobod-pf193-ma-lumotlar.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function import(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:2048'],
        ]);

        try {
            $imported = json_decode($validated['file']->get(), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw ValidationException::withMessages(['file' => 'Yuklangan fayl to‘g‘ri JSON formatida emas.']);
        }

        if (!is_array($imported) || array_is_list($imported)) {
            throw ValidationException::withMessages(['file' => 'JSON fayl platformadan eksport qilingan obyekt bo‘lishi kerak.']);
        }

        $data = array_replace_recursive(
            $this->defaultData(),
            $request->session()->get('dashboard_data', [])
        );
        $importedCount = 0;

        foreach (self::EDITABLE_FIELDS as $path => $label) {
            $value = Arr::get($imported, $path);
            if ($value === null) {
                continue;
            }

            $number = is_int($value) || (is_string($value) && ctype_digit($value))
                ? (int) $value
                : null;

            if ($number === null || $number < 0 || $number > 999999999999999) {
                throw ValidationException::withMessages([
                    'file' => $label.' qiymati noldan katta yoki teng butun son bo‘lishi kerak.',
                ]);
            }

            Arr::set($data, $path, $number);
            $importedCount++;
        }

        if ($importedCount === 0) {
            throw ValidationException::withMessages(['file' => 'JSON faylida import qilish uchun mos ko‘rsatkich topilmadi.']);
        }

        $request->session()->put('dashboard_data', $data);
        $request->session()->flash('status', $importedCount.' ta ko‘rsatkich JSON faylidan yuklandi.');

        return to_route('dashboard.section', ['section' => 'dataManagement']);
    }

    public function saveSettings(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'theme' => ['required', Rule::in(['dark', 'light'])],
            'language' => ['required', Rule::in(['uz', 'uz_cyrl', 'ru'])],
        ]);

        $request->session()->put('dashboard_theme', $validated['theme']);
        $request->session()->put('dashboard_language', $validated['language']);
        $request->session()->flash('status', 'Sozlamalar saqlandi.');

        return to_route('dashboard.section', ['section' => 'settings']);
    }

    private function metricsFor(string $section, array $data): array
    {
        $progress = static fn (int|float $done, int|float $total): int => $total > 0
            ? (int) round(min(100, ($done / $total) * 100))
            : 0;
        $metric = static fn (string $label, int|float|string $value, string $unit = '', ?int $rate = null): array => [
            'label' => $label,
            'value' => is_numeric($value) ? number_format((float) $value, 0, ',', ' ') : $value,
            'unit' => $unit,
            'rate' => $rate,
        ];

        if ($section === 'dashboard') {
            $d = $data['demographics'];
            $registry = $data['socialRegistry'];
            $jobs = $data['unemployment'];

            return [
                $metric('Doimiy aholi', $d['totalPopulation'], 'nafar'),
                $metric('Oilalar soni', $d['familiesCount'], 'ta oila'),
                $metric('Ijtimoiy reyestr', $registry['totalFamilies'], 'ta oila'),
                $metric('Bandligi ta’minlanganlar', $jobs['totalHelped'], 'nafar', $progress($jobs['totalHelped'], $jobs['totalIdentified'])),
            ];
        }

        return match ($section) {
            'demographics' => [
                $metric('Jami aholi', $data['demographics']['totalPopulation'], 'nafar'),
                $metric('Jami oilalar', $data['demographics']['familiesCount'], 'ta'),
                $metric('Ayollar', $data['demographics']['womenCount'], 'nafar', $progress($data['demographics']['womenCount'], $data['demographics']['totalPopulation'])),
                $metric('Erkaklar', $data['demographics']['menCount'], 'nafar', $progress($data['demographics']['menCount'], $data['demographics']['totalPopulation'])),
                $metric('Voyaga yetmaganlar', $data['demographics']['minorsCount'], 'nafar'),
                $metric('Yoshlar (14–30 yosh)', $data['demographics']['youthCount'], 'nafar'),
            ],
            'socialRegistry' => [
                $metric('Jami oilalar', $data['socialRegistry']['totalFamilies'], 'ta oila'),
                $metric('Jami fuqarolar', $data['socialRegistry']['totalCitizens'], 'nafar'),
                $metric('Kambag‘al oilalar', $data['socialRegistry']['categories']['poor']['families'], 'ta'),
                $metric('Davlat ta’minotida', $data['socialRegistry']['categories']['stateSupport']['families'], 'ta oila'),
                $metric('Kambag‘allik chegarasida', $data['socialRegistry']['categories']['nearPoverty']['families'], 'ta oila'),
            ],
            'unemployment', 'businessLoans', 'informalEmployment', 'subsidies', 'vocationalTraining' => $this->progressMetrics($section, $data, $metric, $progress),
            'preschool' => [
                $metric('MTTga muhtoj bolalar', $data['preschool']['neededChildren'], 'nafar'),
                $metric('MTTga qamrab olinganlar', $data['preschool']['enrolledChildren'], 'nafar', $progress($data['preschool']['enrolledChildren'], $data['preschool']['neededChildren'])),
            ],
            'medicalAid' => [
                $metric('Tibbiy yordamga muhtoj', $data['medicalAid']['needed'], 'nafar'),
                $metric('Davolangan fuqarolar', $data['medicalAid']['treated'], 'nafar', $progress($data['medicalAid']['treated'], $data['medicalAid']['needed'])),
            ],
            'housingCadastre' => [
                $metric('Ta’mirga muhtoj uylar', $data['housingRepair']['neededHouses'], 'ta'),
                $metric('Ta’mirlangan oilalar', $data['housingRepair']['helpedFamilies'], 'ta'),
                $metric('Kadastrga muhtoj uylar', $data['cadastre']['neededHouses'], 'ta'),
                $metric('Rasmiylashtirilgan kadastrlar', $data['cadastre']['formalized'], 'ta', $progress($data['cadastre']['formalized'], $data['cadastre']['neededHouses'])),
            ],
            'materialAid' => [
                $metric('Yordamga muhtoj oilalar', $data['materialAid']['needyFamilies'], 'ta'),
                $metric('Yordam olgan oilalar', $data['materialAid']['helpedFamilies'], 'ta', $progress($data['materialAid']['helpedFamilies'], $data['materialAid']['needyFamilies'])),
                $metric('Ajratilgan mablag‘', $data['materialAid']['allocatedAmount'] / 1000000, 'mln so‘m'),
            ],
            'utilities' => [
                $metric('Kommunal yordamga muhtoj', $data['utilities']['needyFamilies'], 'ta oila'),
                $metric('Yordami qoplangan', $data['utilities']['helpedFamilies'], 'ta oila', $progress($data['utilities']['helpedFamilies'], $data['utilities']['needyFamilies'])),
            ],
            'enterpriseRehab' => [
                $metric('Qayta tuzilgan kredit', $data['orchidBeauty']['restructuredLoanAmount'] / 1000000000, 'mlrd so‘m'),
                $metric('Saqlab qolingan ish o‘rni', $data['orchidBeauty']['jobsPreserved'], 'ta'),
                $metric('Yaratilishi rejalashtirilgan', $data['orchidBeauty']['prospectiveNewJobs'], 'ta ish o‘rni'),
            ],
            'allocatedFunds' => [
                $metric('Jami mablag‘', 14971, 'mlrd so‘m'),
                $metric('Mablag‘ yo‘nalishlari', count($data['allocatedFunds']), 'ta'),
            ],
            'otherServices' => [
                $metric('Xizmat ko‘rsatilgan oilalar', $data['otherSocialServices']['servedFamilies'], 'ta'),
                $metric('Ko‘rsatilgan xizmatlar', $data['otherSocialServices']['renderedServices'], 'ta'),
            ],
            default => [],
        };
    }

    private function progressMetrics(string $section, array $data, callable $metric, callable $progress): array
    {
        $keys = [
            'unemployment' => ['unemployment', 'Aniqlangan fuqarolar', 'Amaliy yordam olganlar'],
            'businessLoans' => ['businessAndLoans', 'Tadbirkorlik istagidagilar', 'Kredit olganlar'],
            'informalEmployment' => ['informalEmployment', 'Norasmiy bandlar', 'Rasmiy band bo‘lganlar'],
            'subsidies' => ['subsidiesAndLoans', 'Ko‘makka muhtojlar', 'Ko‘mak olganlar'],
            'vocationalTraining' => ['vocationalTraining', 'Kasb o‘rganishga muhtojlar', 'O‘qishga yuborilganlar'],
        ][$section];
        [$key, $totalLabel, $doneLabel] = $keys;
        $values = $data[$key];

        $metrics = [
            $metric($totalLabel, $values['totalIdentified'], 'nafar'),
            $metric($doneLabel, $values['totalHelped'], 'nafar', $progress($values['totalHelped'], $values['totalIdentified'])),
        ];

        if ($section === 'businessLoans') {
            $metrics[] = $metric('Ajratilgan kredit', $values['allocatedAmount'] / 1000000000, 'mlrd so‘m');
        }

        return $metrics;
    }

    private function defaultData(): array
    {
        return [
            'demographics' => ['familiesCount' => 21123, 'totalPopulation' => 85030, 'womenCount' => 40893, 'menCount' => 44137, 'minorsCount' => 25198, 'youthCount' => 18434],
            'socialRegistry' => [
                'totalFamilies' => 1479, 'totalCitizens' => 6262,
                'categories' => [
                    'stateSupport' => ['families' => 445, 'citizens' => 1609],
                    'poor' => ['families' => 799, 'citizens' => 3611],
                    'nearPoverty' => ['families' => 235, 'citizens' => 1042],
                ],
            ],
            'unemployment' => ['totalIdentified' => 1564, 'totalHelped' => 200],
            'businessAndLoans' => ['totalIdentified' => 3548, 'totalHelped' => 437, 'allocatedAmount' => 29266000000],
            'informalEmployment' => ['totalIdentified' => 3130, 'totalHelped' => 400],
            'subsidiesAndLoans' => ['totalIdentified' => 125, 'totalHelped' => 53],
            'vocationalTraining' => ['totalIdentified' => 258, 'totalHelped' => 160],
            'preschool' => ['neededChildren' => 209, 'enrolledChildren' => 193],
            'medicalAid' => ['needed' => 74, 'treated' => 65],
            'housingRepair' => ['neededHouses' => 10, 'helpedFamilies' => 0, 'allocatedAmount' => 0],
            'cadastre' => ['neededHouses' => 51, 'formalized' => 24],
            'materialAid' => ['needyFamilies' => 103, 'helpedFamilies' => 94, 'allocatedAmount' => 118800000],
            'utilities' => ['needyFamilies' => 1575, 'helpedFamilies' => 0],
            'otherSocialServices' => ['servedFamilies' => 1584, 'renderedServices' => 516],
            'orchidBeauty' => ['restructuredLoanAmount' => 48200000000, 'jobsPreserved' => 150, 'prospectiveNewJobs' => 100],
            'allocatedFunds' => [
                ['name' => 'Oilaviy tadbirkorlik', 'amount' => '6 838 mlrd so‘m', 'share' => 45.68],
                ['name' => 'Foiz kompensatsiyasi', 'amount' => '2 500 mlrd so‘m', 'share' => 16.70],
                ['name' => 'Yoshlar tadbirkorligi', 'amount' => '1 500 mlrd so‘m', 'share' => 10.02],
                ['name' => 'Ayollar daftari', 'amount' => '1 150 mlrd so‘m', 'share' => 7.68],
                ['name' => 'Yoshlar daftari', 'amount' => '1 007 mlrd so‘m', 'share' => 6.73],
                ['name' => 'Saxovat va ko‘mak jamg‘armasi', 'amount' => '950 mln so‘m', 'share' => 0.01],
                ['name' => 'Kambag‘allikni qisqartirish jamg‘armasi', 'amount' => '784 mln so‘m', 'share' => 0.01],
                ['name' => 'Bandlikni ta’minlash jamg‘armasi', 'amount' => '242 mln so‘m', 'share' => 0.01],
            ],
        ];
    }
}
