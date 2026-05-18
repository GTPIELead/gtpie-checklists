const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

// Initialize Firebase Admin once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = getFirestore();
const storage = getStorage();

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body;
    if (!payload || !payload.location || !payload.employee) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Upload photos to Storage
    const tasks = await Promise.all((payload.tasks || []).map(async (task) => {
      if (task.photoData && task.photoData.startsWith('data:image')) {
        try {
          const timestamp = new Date().toISOString().slice(0, 10);
          const loc = (payload.location || 'unknown').replace(/[^a-z0-9]/gi, '_');
          const filename = `photos/${loc}/${timestamp}/${task.id}_${Date.now()}.jpg`;
          const bucket = storage.bucket();
          const file = bucket.file(filename);

          // Decode base64
          const base64Data = task.photoData.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          await file.save(buffer, {
            metadata: { contentType: 'image/jpeg' },
            public: true
          });

          const photoUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
          return { ...task, photoUrl, photoData: null };
        } catch (photoErr) {
          console.error('Photo upload error:', photoErr.message);
          return { ...task, photoData: null };
        }
      }
      // Already has a photoUrl from direct upload
      return { ...task, photoData: null };
    }));

    // Save to Firestore
    const docData = {
      ...payload,
      tasks,
      createdAt: new Date(),
      photoData: null
    };
    delete docData.photoData;

    const docRef = await db.collection('checklists').add(docData);
    console.log('Saved to Firestore:', docRef.id);

    return res.status(200).json({ success: true, id: docRef.id });
  } catch (err) {
    console.error('Submit error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
