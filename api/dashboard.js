const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Get last 200 submissions and filter by date client-side
    // This avoids all timezone query issues
    const snapshot = await db.collection('checklists')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const submissions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
      if (data.startTime?.toDate) data.startTime = data.startTime.toDate().toISOString();
      if (data.endTime?.toDate) data.endTime = data.endTime.toDate().toISOString();
      submissions.push(data);
    });

    console.log(`Dashboard: returned ${submissions.length} submissions`);
    return res.status(200).json({ submissions });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
