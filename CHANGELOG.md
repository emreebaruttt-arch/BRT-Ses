# Ses Odası 1.2.0

## Yenilikler
- İlk açılışta sunucu oluşturma veya davet koduyla katılma seçeneği.
- Sunucu adı ve davet kodu cihazda kaydedilir; sonraki açılışlarda kayıtlı sunucuya tek tıkla dönülebilir.
- Aktif uygulamadan yeni bir sunucuya geçişte bağlantı temiz biçimde yenilenir.
- Ayarlar penceresi kategori menüsü, daha geniş içerik alanı ve mobil pencere boyutlarına uyumlu düzenle yenilendi.
- Mikrofon testinin yanına hoparlör testi eklendi.
- Uygulama açılışta ve altı saatte bir yeni sürüm denetler; yeni sürüm bulunduğunda bildirim verir, sürüm notlarını gösterir ve onaydan sonra paketi doğrulayarak kurar.

## Güvenlik ve uyumluluk
- Mevcut PeerJS oda/kanal, ses, kişi başı ses seviyesi, ekran paylaşımı ve yerel ayar saklama yapısı korunmuştur.
- Güncelleme dosyası GitHub SHA-256 özetiyle doğrulanır; kurulum başarısız olursa önceki dosyalar geri yüklenir.
