require('dotenv').config();
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const COLLECTION = process.env.FIREBASE_COLLECTION || 'atractivos';
const saPath = process.env.FIREBASE_SA_PATH || './serviceAccountKey.json';

if (!fs.existsSync(saPath)) {
  throw new Error('No se encontró serviceAccountKey.json. Configura FIREBASE_SA_PATH o coloca el archivo en la raíz.');
}

const serviceAccount = require(path.resolve(saPath));

// Inicialización segura sin 'admin.apps'
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  });
}

const db = getFirestore();
const col = db.collection(COLLECTION);

// Helpers: Firestore usa docId (string). Mantendremos el campo id numérico para continuidad.
async function nextNumericId() {
  const snap = await col.orderBy('id', 'desc').limit(1).get();
  if (snap.empty) return 1;
  return (snap.docs[0].data().id || 0) + 1;
}

function normalize(doc) {
  const data = doc.data();
  return {
    // devolvemos ambos por compatibilidad, id numérico y _id si quieres
    id: data.id,
    nombre: data.nombre || '',
    descripcion: data.descripcion || '',
    ubicacion: data.ubicacion || ''
  };
}

async function all() {
  const snap = await col.orderBy('id').get();
  return snap.docs.map(normalize);
}

async function findById(id) {
  const q = await col.where('id', '==', Number(id)).limit(1).get();
  if (q.empty) return null;
  return normalize(q.docs[0]);
}

async function search({ nombre = '', ubicacion = '' }) {
  // Firestore no soporta "contains" insensible a mayúsculas en server-side.
  // Enfoque: traer todo y filtrar en servidor (OK para demo/curso).
  const list = await all();
  const name = (nombre || '').toLowerCase();
  const place = (ubicacion || '').toLowerCase();
  return list.filter(a =>
    (!name || a.nombre.toLowerCase().includes(name)) &&
    (!place || a.ubicacion.toLowerCase().includes(place))
  );
}

async function create({ nombre, descripcion, ubicacion = '' }) {
  const id = await nextNumericId();
  const payload = {
    id,
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    ubicacion: (ubicacion || '').trim()
  };
  await col.doc(String(id)).set(payload); // usamos id numérico como docId
  return payload;
}

async function update(id, { nombre, descripcion, ubicacion = '' }) {
  const docRef = col.doc(String(Number(id)));
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const payload = {
    id: Number(id),
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    ubicacion: (ubicacion || '').trim()
  };
  await docRef.set(payload, { merge: true });
  return payload;
}

async function remove(id) {
  const docRef = col.doc(String(Number(id)));
  const snap = await docRef.get();
  if (!snap.exists) return false;
  await docRef.delete();
  return true;
}

module.exports = { all, findById, search, create, update, remove };
