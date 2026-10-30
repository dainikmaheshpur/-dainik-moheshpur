# দৈনিক মহেশপুর — অনলাইন নিউজ পোর্টাল (Persistent Starter)

## এই সংস্করণে
- শুধুমাত্র মহেশপুর উপজেলা-কেন্দ্রিক সংবাদ কাঠামো; সারাদেশের আলাদা বিভাগ নেই
- মহেশপুর পৌরসভা ও ১২টি ইউনিয়নের এলাকা-ভিত্তিক সংবাদ বিভাগ
- স্থানীয় বিষয়ভিত্তিক বিভাগ: শিক্ষা, কৃষি, বিনোদন, স্বাস্থ্য, খেলাধুলা, সংস্কৃতি, উন্নয়ন, দুর্ঘটনা ও মানবিক সংবাদ
- Responsive বাংলা নিউজ হোমপেজ ও article pages
- Admin login, login rate limit, bcrypt password hash
- News create/edit/delete, draft/publish
- Uploaded images stored in configured upload directory
- SQLite database and SQLite-backed sessions
- Render Blueprint configuration with a persistent disk and HTTPS support

## গুরুত্বপূর্ণ বাস্তবতা
এই Render সেটআপে persistent disk ব্যবহৃত হয়, তাই এটি **paid Render web service**-এর জন্য কনফিগার করা। Render-এর free web service-এর filesystem স্থায়ী নয় এবং free Postgres ৩০ দিন পর expire করতে পারে। প্রকৃত সংবাদমাধ্যমের জন্য free-only deployment-কে permanent storage হিসেবে ধরে নেবেন না। Render-এর managed TLS/HTTPS চালু হয় সার্ভিস প্রকাশ ও domain configure করার পর।

## লোকাল কম্পিউটারে চালানো
1. Node.js LTS ইনস্টল করুন।
2. ZIP extract করে project folder-এ Terminal খুলুন।
3. `npm install` চালান।
4. `.env.example` কপি করে `.env` করুন।
5. শক্তিশালী Admin password hash বানান:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('YOUR-STRONG-PASSWORD', 12))"
   ```
6. hash-টি `.env`-এর `ADMIN_PASSWORD_HASH`-এ বসান। `SESSION_SECRET`-এ লম্বা, random secret দিন। `ADMIN_USERNAME`-ও নিজের মতো বদলান।
7. `npm start` চালান।
8. Website: `http://localhost:3000` — Admin: `http://localhost:3000/admin`

## Render-এ প্রকাশ
1. ZIP extract করুন।
2. GitHub-এ private repository তৈরি করে project files upload/push করুন। `.env`, `data/`, `node_modules/` কখনো upload করবেন না।
3. Render account-এ sign in করে **New → Blueprint** নির্বাচন করে GitHub repository connect করুন।
4. Render `render.yaml` পড়ে একটি paid web service ও `/var/data`-এ 1 GB persistent disk তৈরি করবে। Blueprint-এর জন্য plan ও disk charge হতে পারে—confirm করার আগে dashboard-এ price দেখুন।
5. Render service-এর Environment settings-এ `ADMIN_USERNAME` এবং `ADMIN_PASSWORD_HASH` দিন। hash তৈরি করতে local machine-এ Node.js দিয়ে উপরের command চালান। কোনো password chat-এ পাঠাবেন না।
6. Deploy শেষ হলে Render-এর দেওয়া `https://...onrender.com` URL খুলুন। Admin URL হবে `https://...onrender.com/admin`।
7. Custom domain কিনলে Render service settings-এ domain add করে DNS record সেট করুন। Render-managed TLS certificate ready হলে HTTPS দিয়ে পরীক্ষা করুন।

## Domain
উদাহরণ: `dainikmoheshpur.com` বা `dainikmoheshpur.com.bd`। কোনটি পাওয়া যায় তা registrar-এ live search করে নিশ্চিত করতে হবে। কোনো নামের প্রাপ্যতা ধরে নেওয়া হয়নি। `.com.bd`-এর জন্য সংশ্লিষ্ট নিবন্ধকের eligibility/document requirements যাচাই করুন।

## ছবির ও ডেটাবেসের স্থায়িত্ব
Render-এ `DATA_DIR=/var/data`, `UPLOAD_DIR=/var/data/uploads` রাখা হয়েছে। SQLite database, session DB এবং uploaded images এই disk-এর মধ্যে থাকবে। Disk মুছে গেলে বা ভুল configuration হলে data loss হতে পারে—নিয়মিত backup/export করুন। Disk-backed SQLite single web instance-এর জন্য উপযুক্ত; একাধিক app instance-এ scale করার আগে PostgreSQL + object storage-এ migration করুন।

## Production checklist
- Strong unique admin password এবং secret; secrets শুধু Render environment variables-এ রাখুন।
- HTTPS এবং custom domain verify করুন।
- `/api/admin/login` rate-limited; তবুও নিয়মিত dependency updates ও security checks দরকার।
- নিয়মিত database ও uploaded images backup নিয়ে restore test করুন।
- সম্পাদক/রিপোর্টার roles, audit logs, password reset, CSRF protection, content sanitization, SEO metadata, sitemap.xml, robots.txt, social previews এবং image processing যোগ করুন।
- বাস্তব খবর যাচাই করে প্রকাশ করুন; ছবি ও লেখা ব্যবহারে copyright/privacy মেনে চলুন।

## Admin use
Admin login → title/category/summary/body পূরণ → image upload → status `প্রকাশ করুন` → save। Draft public homepage-এ দেখাবে না।
