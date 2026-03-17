// Firestore singleton — reuses the firebase-admin App initialised in firebase-admin.ts.
// Importing firebase-admin.ts as a side effect ensures initializeApp() has been called
// before getFirestore() is invoked.
import './firebase-admin.js'
import { getFirestore } from 'firebase-admin/firestore'

export const firestoreDb = getFirestore()
