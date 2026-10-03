const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp();
}

function fail(code, message) {
    throw new functions.https.HttpsError(code, message);
}

exports.adminSetUserPassword = functions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            fail("unauthenticated", "Sign in required.");
        }

        const callerUid = context.auth.uid;
        const callerSnap = await admin.firestore().collection("users").doc(callerUid).get();
        const caller = callerSnap.data() || {};

        if (!callerSnap.exists || caller.role !== "admin") {
            fail("permission-denied", "Only admins can change other users' passwords.");
        }

        const targetUid = data && data.uid;
        const password = data && data.password;

        if (!targetUid || typeof password !== "string") {
            fail("invalid-argument", "User and password are required.");
        }

        if (password.length < 6) {
            fail("invalid-argument", "Password must be at least 6 characters.");
        }

        if (targetUid === callerUid) {
            fail("invalid-argument", "Use Change Password for your own account.");
        }

        try {
            await admin.auth().updateUser(targetUid, { password });
        } catch (authErr) {
            console.error("updateUser failed", authErr);
            const authCode = authErr.code || "";
            if (authCode === "auth/user-not-found") {
                fail("not-found", "This user is in Firestore but has no Firebase Authentication account.");
            }
            if (authCode === "auth/invalid-password" || authCode === "auth/weak-password") {
                fail("invalid-argument", "That password is too weak. Use at least 6 characters.");
            }
            fail("failed-precondition", authErr.message || "Firebase Auth rejected the password update.");
        }

        try {
            await admin.firestore().collection("adminAuditLogs").add({
                action: "set_user_password",
                adminId: callerUid,
                targetUid,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (logErr) {
            console.error("audit log failed", logErr);
        }

        return { ok: true };
    } catch (err) {
        if (err instanceof functions.https.HttpsError) {
            throw err;
        }
        console.error("adminSetUserPassword", err);
        fail("failed-precondition", err.message || "Unexpected error while updating password.");
    }
});
