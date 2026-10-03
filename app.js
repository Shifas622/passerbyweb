import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// IMPORTANT: Replace this configuration with your actual Firebase project configuration
// You can find this in your Firebase Console > Project Settings > General > Your apps (Web app)
const firebaseConfig = {
    apiKey: "AIzaSyALmegZBVAnFpbDjfRHRHrjiGaYQj963oY",
    authDomain: "vehicleqr-31b56.firebaseapp.com",
    projectId: "vehicleqr-31b56",
    storageBucket: "vehicleqr-31b56.firebasestorage.app",
    messagingSenderId: "201283596931",
    appId: "1:201283596931:web:ceeae851dab92126b961b6" // Configured automatically
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Get vehicle ID from URL parameter (e.g. ?id=123)
const urlParams = new URLSearchParams(window.location.search);
const vehicleId = urlParams.get('id');

// DOM Elements
const ui = {
    loading: document.getElementById('loadingState'),
    error: document.getElementById('errorState'),
    errorMsg: document.getElementById('errorMessage'),
    vehicle: document.getElementById('vehicleState'),
    
    vNo: document.getElementById('vehicleNo'),
    vDetails: document.getElementById('vehicleDetails'),
    vIcon: document.getElementById('vehicleIcon'),
    
    alertBtns: document.querySelectorAll('.alert-btn'),
    toast: document.getElementById('toast'),
    
    cameraBtn: document.getElementById('cameraBtn'),
    cameraInput: document.getElementById('cameraInput'),
    photoPreviewContainer: document.getElementById('photoPreviewContainer'),
    photoPreview: document.getElementById('photoPreview'),
    removePhotoBtn: document.getElementById('removePhotoBtn'),
    alertsTitle: document.getElementById('alertsTitle')
};

let currentVehicleData = null;
let selectedPhotoFile = null;

async function loadVehicle() {
    if (!vehicleId) {
        showError("Invalid QR Code (No ID in URL)");
        return;
    }

    try {
        const docRef = doc(db, "vehicles", vehicleId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentVehicleData = docSnap.data();
            displayVehicle(currentVehicleData);
        } else {
            showError("Vehicle not found. It might have been deleted.");
        }
    } catch (error) {
        console.error("Error fetching vehicle:", error);
        // This is usually caused by missing/invalid Firebase Config
        showError("Error connecting to database. Please check Firebase config.");
    }
}

function displayVehicle(data) {
    ui.vNo.textContent = data.vehicle_no || "Unknown";
    ui.vDetails.textContent = `${data.vehicle_name || 'Unknown'} • ${data.category || 'Vehicle'}`;
    
    let iconName = "directions_car";
    if (data.category === "Bike") iconName = "motorcycle";
    else if (data.category === "Truck") iconName = "local_shipping";
    else if (data.category === "Bus") iconName = "directions_bus";
    
    ui.vIcon.textContent = iconName;

    ui.loading.classList.add('hidden');
    ui.error.classList.add('hidden');
    ui.vehicle.classList.remove('hidden');
}

function showError(msg) {
    ui.errorMsg.textContent = msg;
    ui.loading.classList.add('hidden');
    ui.vehicle.classList.add('hidden');
    ui.error.classList.remove('hidden');
}

async function sendAlert(type, message) {
    if (!currentVehicleData || !selectedPhotoFile) {
        alert("Please take a photo as proof first.");
        return;
    }

    // Disable all buttons while sending
    ui.alertBtns.forEach(btn => btn.disabled = true);
    ui.loading.classList.remove('hidden');
    ui.vehicle.classList.add('hidden');
    ui.loading.querySelector('p').textContent = "Uploading proof and sending alert...";

    try {
        // 1. Upload the photo to Firebase Storage
        const fileExt = selectedPhotoFile.name.split('.').pop() || 'jpg';
        const timestamp = new Date().getTime();
        const storageRef = ref(storage, `alert_proofs/${vehicleId}_${timestamp}.${fileExt}`);
        
        await uploadBytes(storageRef, selectedPhotoFile);
        const photoUrl = await getDownloadURL(storageRef);

        // 2. Save the alert with the photo URL in Firestore
        await addDoc(collection(db, "alerts"), {
            vehicleId: vehicleId,
            vehicleNo: currentVehicleData.vehicle_no || 'Unknown',
            ownerEmail: currentVehicleData.user_email || '', 
            alertType: type,
            message: message,
            imageUrl: photoUrl, // Adding the photo URL
            createdAt: serverTimestamp(),
            isRead: false
        });

        ui.loading.classList.add('hidden');
        ui.vehicle.classList.remove('hidden');
        showToast();
        
        // Reset the photo field
        ui.removePhotoBtn.click();
    } catch (error) {
        console.error("Error sending alert:", error);
        alert("Failed to send alert. " + error.message);
        ui.loading.classList.add('hidden');
        ui.vehicle.classList.remove('hidden');
    }
}

function showToast() {
    ui.toast.classList.remove('hidden');
    setTimeout(() => {
        ui.toast.classList.add('hidden');
    }, 3000);
}

// Event Listeners for the buttons
ui.alertBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const msg = btn.getAttribute('data-message');
        sendAlert(type, msg);
    });
});

// Photo selection handlers
ui.cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        selectedPhotoFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            ui.photoPreview.src = e.target.result;
            ui.cameraBtn.classList.add('hidden');
            ui.photoPreviewContainer.classList.remove('hidden');
            
            // Enable the alert buttons now that we have proof
            ui.alertBtns.forEach(btn => btn.disabled = false);
            ui.alertsTitle.style.opacity = '1';
        };
        reader.readAsDataURL(file);
    }
});

ui.removePhotoBtn.addEventListener('click', () => {
    selectedPhotoFile = null;
    ui.cameraInput.value = '';
    ui.cameraBtn.classList.remove('hidden');
    ui.photoPreviewContainer.classList.add('hidden');
    
    // Disable buttons again
    ui.alertBtns.forEach(btn => btn.disabled = true);
    ui.alertsTitle.style.opacity = '0.5';
});

// Start the app when the script loads
loadVehicle();
