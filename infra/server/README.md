# تخزين الملفات على سيرفرنا (من غير كلاود)

كل الصور والـ PDFs بتتحفظ على هارد السيرفر بتاعنا **كملفات عادية**: الوحدات، والصفقات، والمطالبات، والعقود، والإيصالات.

- الـ API بيكلّم التخزين بلغة S3، فمحتاجين نشغّل **versitygw** على نفس السيرفر.
- versitygw برنامج مفتوح المصدر، ونفس اللي الـ CI و`pnpm infra:up` بيستخدموه.
- بيرد بلغة S3، وبيكتب كل ملف على الديسك زي ما هو.
- مفيش أي خدمة برّه، ولا اشتراك، ولا نت.

```
/srv/places/files/places/2026/11/<id>.jpg        ← الملف نفسه (تقدر تفتحه عادي)
/srv/places/files-meta/places/2026/11/<id>.jpg/  ← نوعه والـ checksum بتاعه
```

- كل ملف مربوط بصاحبه (الوحدة، أو الصفقة، أو المطالبة) في الداتابيز.
- السيستم مابيعتمدش على اسم الفولدر.

## إزاي الملف بيتنقل

1. المتصفح بيطلب من الـ API يرفع ملف.
2. الـ API بيتأكد من الصلاحية والنوع والحجم، وبيدّي **رابط موقّع** صالح 5 دقايق.
3. المتصفح بيرفع على الرابط ده مباشرة.

يعني الصور الكبيرة مش بتعدّي على الـ API، والـ API بيشوف الملف بعد الرفع قبل ما يقبله.

**عشان كده التخزين لازم يكون متاح للمتصفح:** بنفتحه على دومين فرعي بـ HTTPS من الـ reverse proxy، زي `files.<الدومين>`. versitygw نفسه سامع على `127.0.0.1` بس.

## التسطيب (Linux، Ubuntu / Debian)

```bash
# 1) البرنامج: نفس النسخة اللي الـ CI متجربة عليها، ومتأكدين من الـ checksum بتاعها
VER=v1.9.0
cd /tmp
curl -LO https://github.com/versity/versitygw/releases/download/$VER/versitygw_${VER}_Linux_x86_64.tar.gz
curl -LO https://github.com/versity/versitygw/releases/download/$VER/checksums.txt
grep Linux_x86_64.tar.gz checksums.txt | sha256sum -c -
tar xzf versitygw_${VER}_Linux_x86_64.tar.gz
sudo install versitygw /usr/local/bin/

# 2) مستخدم وفولدرات على الهارد الكبير (لو الهارد متركّب في مكان تاني، اعمل /srv/places لينك ليه)
sudo useradd --system --home /srv/places places || true
sudo mkdir -p /srv/places/files /srv/places/files-meta /etc/places
sudo chown -R places:places /srv/places

# 3) المفاتيح: نفس S3_ACCESS_KEY و S3_SECRET_KEY اللي في .env بتاع الـ API
sudo tee /etc/places/files.env >/dev/null <<'ENV'
ROOT_ACCESS_KEY=<S3_ACCESS_KEY>
ROOT_SECRET_KEY=<S3_SECRET_KEY>
VGW_CORS_ALLOW_ORIGIN=https://<دومين الويب>
ENV
sudo chmod 600 /etc/places/files.env

# 4) الخدمة: بتقوم لوحدها مع السيرفر وبترجع لو وقعت
sudo cp infra/server/places-files.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now places-files
systemctl status places-files
```

- السر (`S3_SECRET_KEY`) طويل وعشوائي، اعمله بـ `openssl rand -hex 24`. مايتكتبش في الريبو، ولا في أي issue، ولا في أي شات.
- `--fsync`: الملف مابيتقبلش غير لما يتكتب على الديسك فعلًا، فلو النور قطع مفيش صورة بتضيع.

## الـ reverse proxy (nginx)

```nginx
server {
  listen 443 ssl;
  server_name files.<الدومين>;
  # ssl_certificate ... (نفس شهادة الدومين)
  client_max_body_size 25m;          # أكبر ملف: PDF لحد 20 ميجا
  location / {
    proxy_pass http://127.0.0.1:9000;
    proxy_set_header Host $host;     # لازم: الرابط الموقّع متوقّع على اسم الدومين ده
    proxy_request_buffering off;
  }
}
```

وفي `.env` بتاع الـ API:

```
S3_ENDPOINT=https://files.<الدومين>
S3_BUCKET=places
S3_ACCESS_KEY=<نفس اللي فوق>
S3_SECRET_KEY=<نفس اللي فوق>
WEB_ORIGIN=https://<دومين الويب>
```

الـ API بيعمل الـ bucket لوحده أول ما يقوم.

## لو السيرفر Windows

1. نزّل `versitygw_v1.9.0_Windows_x86_64.zip` من نفس صفحة الـ releases، واتأكد من الـ checksum بـ `Get-FileHash`.
2. حط `versitygw.exe` في `C:\places\bin`، والفولدرات على الهارد الكبير، مثلًا `E:\places\files` و`E:\places\files-meta`.
3. سجّله كخدمة بـ [NSSM](https://nssm.cc).
4. حط المفاتيح في **Environment** بتاع الخدمة، مش في سطر الأوامر.

```powershell
nssm install places-files C:\places\bin\versitygw.exe --port 127.0.0.1:9000 --iam-dir E:\places\files-meta --quiet posix --sidecar E:\places\files-meta --fsync E:\places\files
```

## الباك أب

الملفات هي الفولدرين دول، والداتابيز بتقول كل ملف بتاع مين. **الاتنين لازم يتعملهم باك أب مع بعض كل ليلة:**

```bash
pg_dump -Fc "$DATABASE_URL" > /backup/places-$(date +%F).dump
rsync -a /srv/places/files /srv/places/files-meta /backup/
```

- الأحسن الباك أب يبقى على هارد تاني أو جهاز تاني، مش على نفس الهارد.
- الاسترجاع: ترجّع الفولدرين مكانهم، وتعمل `pg_restore` للداتابيز.

## على جهازك (development)

`pnpm files:local` بيشغّل نفس versitygw بنفس الطريقة، والملفات بتتحفظ في `.local/s3-files`. لو مش لاقيه:

```bash
gh release download v1.9.0 -R versity/versitygw -p "versitygw_v1.9.0_Windows_x86_64.zip"
```

فك الضغط وحط `versitygw.exe` في `.local/bin/`.
