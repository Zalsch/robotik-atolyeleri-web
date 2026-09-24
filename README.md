# Robotik Atölyeleri

Robotik Atölyeleri için mobil uyumlu öğrenci takip uygulaması. Yönetici sınıfları ve öğretmenleri, öğretmenler dersleri ve öğrencileri yönetir. Öğrenci ile veli aynı hesap üzerinden ilerlemeyi takip eder.

**Deneme yayını:** [robotik-atolyeleri.vercel.app](https://robotik-atolyeleri.vercel.app/) · **Giriş:** [Kullanıcı adı ve şifre](https://robotik-atolyeleri.vercel.app/sign-in)

## Neler yapılabilir?

| Rol | Başlıca işlemler |
| --- | --- |
| Yönetici | Öğretmen hesabı ve sınıf oluşturma, sınıfa en fazla iki öğretmen atama |
| Öğretmen | Atandığı sınıfa öğrenci ekleme, şifre yenileme, müfredat, ders programı, yoklama, ödev ve duyuru yönetimi |
| Öğrenci / veli | Dersleri, konu ilerlemesini, devam oranını, ödev durumunu ve duyuruları görme |

Müfredat konularında kısa açıklama ve Google Drive PDF bağlantısı bulunabilir. Öğretmen PDF bağlantısını müfredatı kullanan tüm sınıflar için açıp kapatır. Yoklama `var` / `yok`, fiziksel ödev teslimi `getirdi` / `getirmedi` olarak işaretlenir. Uygulama ana ekrana eklenebilir; bildirim izni veren destekli öğrenci cihazlarına sınıf duyuruları Web Push ile gönderilir.

Dışarıdan hesap kaydı, ayrı veli hesabı ve uygulama içinden ödev dosyası teslimi yoktur.

## Teknoloji

- **Uygulama:** Next.js 16 App Router, React 19, TypeScript ve PWA
- **Veri:** Supabase PostgreSQL; şema değişiklikleri `supabase/migrations/` içinde
- **Giriş:** PostgreSQL uygulama hesapları, Argon2id parola özeti ve `iron-session`. Clerk kullanılmaz.
- **Entegrasyonlar:** Google Sheets API ile yoklamanın tek yönlü aktarımı, Google Drive PDF bağlantıları ve Web Push

## Yerelde çalıştırma

Node.js **20.9 veya üzeri** ve npm gerekir.

```bash
git clone https://github.com/Zalsch/robotik-atolyeleri-web.git
cd robotik-atolyeleri-web
npm ci
cp .env.example .env.local
```

`.env.local` dosyasına kendi sunucu ayarlarınızı girin. Uygulamanın gerçek hesap ve verilerle çalışması için en az `SUPABASE_URL`, `SUPABASE_SECRET_KEY` ve en az 32 karakterlik `SESSION_SECRET` gerekir. Geliştirme sunucusunu başlatın:

```bash
npm run dev
```

Ardından [http://localhost:3000](http://localhost:3000) adresini açın. Ana sayfa tanıtım ekranıdır; kullanıcı girişinden sonra işlemler `/panel` altında yapılır.

### Ortam değişkenleri

| Değişken | Kullanım |
| --- | --- |
| `SUPABASE_URL` | Supabase proje adresi |
| `SUPABASE_SECRET_KEY` | **Yalnız sunucuda** kullanılan Supabase secret veya service role anahtarı |
| `SESSION_SECRET` | Oturum çerezleri için en az 32 karakterlik rastgele sır |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push; `VAPID_SUBJECT` HTTPS adresi veya `mailto:` adresi olmalı |
| `CRON_SECRET` | Geciken bildirim ve yoklama teslimlerini işleyen cron uç noktası için sır |
| `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Google Sheets yoklama aktarımı; hizmet hesabı JSON'u Base64 olarak yalnız sunucuda tutulur |

`.env.local`, hizmet hesabı JSON'u, yönetici şifresi ve diğer sırlar Git'e gönderilmemelidir. `SUPABASE_SECRET_KEY` ile özel VAPID anahtarına `NEXT_PUBLIC_` öneki eklemeyin. Depodaki `.env.example` yalnız değişken adlarını içerir.

## Veritabanı ve ilk yönetici

**Mevcut Robotik Atölyeleri Supabase projesi kullanılıyorsa** migration'lar zaten uygulanmıştır ve ilk yönetici hesabı açılmıştır. Bu adımları tekrar çalıştırmayın. README veya depoda yönetici şifresi bulunmaz.

**Yeni ve boş bir Supabase projesi kuruluyorsa** önce `supabase/migrations/` dosyalarını sırayla uygulayın. Projeyi CLI ile bağlamadan önce doğru proje kimliğini kontrol edin:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

`YOUR_PROJECT_REF` değerini yeni Supabase projenizin kimliğiyle değiştirin. `--dry-run` çıktısındaki migration listesini kontrol ettikten sonra gerçek aktarımı başlatın.

Yalnızca yönetici hesabı bulunmayan yeni kurulumda ilk yöneticiyi oluşturun:

```bash
npm run bootstrap:admin -- admin "Yönetici"
```

Komut şifreyi terminalde gizli olarak ister; en az 12 karakter gerekir. Yönetici hesabı zaten varsa komut ikinci bir yönetici oluşturmayı reddeder. Daha sonra yönetici öğretmen hesaplarını, atanmış öğretmenler kendi sınıflarındaki öğrenci hesaplarını açar.

## Vercel'e bağlama

Deneme sitesi zaten bir Vercel projesinde çalışıyor. GitHub deposunu bu **mevcut Vercel projesinin** **Settings → Git** bölümünden bağlayın; yeni bir proje açmanız mevcut alan adı ve ortam ayarlarından ayrı bir dağıtım oluşturur. Vercel'in [GitHub bağlantısı belgesi](https://vercel.com/docs/git/vercel-for-github) bu yolu açıklar.

Kök dizin depo köküdür. Production ortamında gereken değişkenleri `.env.example` ile karşılaştırın; değerleri GitHub'a veya README'ye koymayın. `vercel.json` günlük teslim cron'unu tanımlar. Git bağlantısından sonra `main` dalına gönderilen değişiklikler Vercel tarafından dağıtılır.

## Kontroller

```bash
npm run typecheck
npm run check:schema
npm run check:sheet-layout
npm run build
```

`check:schema` yerel PGlite veritabanında şema ve yetki kurallarını, `check:sheet-layout` yoklama tablosu düzenini denetler. `check:live-*` komutları gerçek Supabase veritabanında geçici kayıtlar oluşturur. Özellikle `check:live-auth` yalnız boş kullanıcı tablosu içindir; mevcut projede çalıştırılmamalıdır.

## Güncel durum

- Temel hesap, sınıf, müfredat, ders, yoklama, ödev ve duyuru akışları hazırdır.
- Web Push kodu ve Vercel ayarları hazırdır; gerçek Android/iPhone cihazlarında bildirim teslimi ve ana ekrana kurulumun son doğrulaması beklenmektedir.
- Google Sheets aktarım kodu hazırdır. Hizmet hesabı henüz bağlanmadığı ve aktarım şimdilik bekletildiği için gerçek tablo yazımı doğrulanmamıştır. Yoklamanın asıl kaydı PostgreSQL'dedir.
- Konu PDF bağlantısını uygulamada kapatmak, daha önce kopyalanmış ve Google Drive'da hâlâ paylaşıma açık olan bağlantıyı geçersiz kılmaz.

Bu depo, uygulamanın çalışması için gereken kaynak kodu içerir. Yerel çalışma notları, Memory Bank, ajan talimatları, gizli ortam dosyaları ve kullanılmayan referans görselleri Git dışında tutulur.
