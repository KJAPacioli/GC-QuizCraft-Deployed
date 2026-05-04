import { db, auth } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function logSystemAction(actionType: string, description: string) {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    await addDoc(collection(db, 'audit_logs'), {
      user_id: user.uid,
      action_type: actionType,
      description: description,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
