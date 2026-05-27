const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

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
    let start, end;
    const dateStr = req.query.date || new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});

    // Build start/end in Eastern time by using the date string directly
    // Eastern is UTC-4 (EDT) or UTC-5 (EST)
    // Use UTC-5 for start (conservative) and UTC-4 for end to catch all Eastern times
    start = new Date(dateStr + 'T05:00:00.000Z'); // midnight EST = 5AM UTC
    end = new Date(dateStr + 'T28:00:00.000Z');   // midnight next day EDT = 4AM UTC next day

    // Simpler and more reliable:
    start = new Date(dateStr);
    start.setUTCHours(4, 0, 0, 0); // midnight EDT (UTC-4)
    end = new Date(dateStr);
    end.setUTCHours(27, 59, 59, 999); // 23:59 EDT

    console.log('Date:', dateStr, 'Query from', start.toISOString(), 'to', end.toISOString());

    const snapshot = await db.collection('checklists')
      .where('createdAt', '>=', Timestamp.fromDate(start))
      .where('createdAt', '<=', Timestamp.fromDate(end))
      .get();

    const submissions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
      if (data.startTime?.toDate) data.startTime = data.startTime.toDate().toISOString();
      if (data.endTime?.toDate) data.endTime = data.endTime.toDate().toISOString();
      submissions.push(data);
    });

    console.log(`Found ${submissions.length} submissions for ${dateStr}`);
    return res.status(200).json({ submissions });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
