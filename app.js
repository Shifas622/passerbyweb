// Supabase Configuration loaded from window.ENV (env.js)
const SUPABASE_URL = (window.ENV && window.ENV.SUPABASE_URL) || "https://qmykiksahxpgexjlvwju.supabase.co";
const SUPABASE_ANON_KEY = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || "sb_publishable_8j8uBy1GzTatDitIuL6pdw_Z39IbMty";

// Initialize Supabase Client
const supabase = (window.supabase && SUPABASE_URL !== "YOUR_SUPABASE_URL") 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

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
    dndState: document.getElementById('dndState'),
    alertsInputArea: document.getElementById('alertsInputArea'),
    successArea: document.getElementById('successArea'),
    requestChatBtn: document.getElementById('requestChatBtn'),

    // Live Photo Modal & Viewfinder Elements
    photoModal: document.getElementById('photoModal'),
    modalAlertTitle: document.getElementById('modalAlertTitle'),
    modalAlertSubtitle: document.getElementById('modalAlertSubtitle'),
    modalAlertIcon: document.getElementById('modalAlertIcon'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelAlertBtn: document.getElementById('cancelAlertBtn'),
    confirmSendAlertBtn: document.getElementById('confirmSendAlertBtn'),
    confirmSendText: document.getElementById('confirmSendText'),
    customMessageContainer: document.getElementById('customMessageContainer'),
    customMessageInput: document.getElementById('customMessageInput'),
    
    cameraViewfinderContainer: document.getElementById('cameraViewfinderContainer'),
    cameraVideo: document.getElementById('cameraVideo'),
    snapPhotoBtn: document.getElementById('snapPhotoBtn'),
    photoPreviewContainer: document.getElementById('photoPreviewContainer'),
    photoPreviewImg: document.getElementById('photoPreviewImg'),
    retakePhotoBtn: document.getElementById('retakePhotoBtn'),
    cameraFallbackContainer: document.getElementById('cameraFallbackContainer'),
    fallbackCameraBtn: document.getElementById('fallbackCameraBtn'),
    liveCameraInput: document.getElementById('liveCameraInput')
};

let currentVehicleData = null;
let currentPendingAlert = null; // { type, message }
let capturedPhotoFile = null;
let activeCameraStream = null;

async function loadVehicle() {
    if (!vehicleId) {
        showError("Invalid QR Code (No vehicle ID in URL)");
        return;
    }

    if (!supabase) {
        showError("Supabase not configured. Please set SUPABASE_URL & SUPABASE_ANON_KEY in app.js.");
        return;
    }

    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('id', vehicleId)
            .single();

        if (error || !data) {
            console.error("Fetch error:", error);
            showError("Vehicle not found. It may have been deleted.");
            return;
        }

        currentVehicleData = data;
        displayVehicle(currentVehicleData);
    } catch (error) {
        console.error("Error fetching vehicle from Supabase:", error);
        showError("Error connecting to database. Please check Supabase configuration.");
    }
}

function displayVehicle(data) {
    ui.vNo.textContent = data.vehicle_no || "Unknown";
    ui.vDetails.textContent = `${data.vehicle_name || 'Unknown'} • ${data.category || 'Vehicle'}`;
    
    let iconName = "directions_car";
    if (data.category === "Bike") iconName = "motorcycle";
    else if (data.category === "Truck") iconName = "local_shipping";
    else if (data.category === "Bus") iconName = "directions_bus";
    
    const iconWrapper = ui.vIcon.parentElement;
    if (data.image_url) {
        iconWrapper.innerHTML = `<img src="${data.image_url}" alt="Vehicle" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else {
        iconWrapper.innerHTML = `<span id="vehicleIcon" class="material-icons">${iconName}</span>`;
    }

    ui.loading.classList.add('hidden');
    ui.error.classList.add('hidden');
    ui.vehicle.classList.remove('hidden');

    if (data.is_dnd_active) {
        ui.dndState.classList.remove('hidden');
        ui.alertsInputArea.classList.add('hidden');
        document.getElementById('issueTitle').classList.add('hidden');
    } else {
        ui.dndState.classList.add('hidden');
        document.getElementById('issueTitle').classList.remove('hidden');
        ui.alertsInputArea.classList.remove('hidden');
    }
}

function showError(msg) {
    ui.errorMsg.textContent = msg;
    ui.loading.classList.add('hidden');
    ui.vehicle.classList.add('hidden');
    ui.error.classList.remove('hidden');
}

// === IN-BROWSER LIVE CAMERA & ALERT FLOW (ZERO RAM CRASH) ===

// Open modal and start live camera when any alert button is clicked
ui.alertBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const msg = btn.getAttribute('data-message');

        currentPendingAlert = { type, defaultMessage: msg };

        let iconName = "warning";
        if (type === "Emergency") iconName = "lightbulb";
        else if (type === "Security") iconName = "sensor_window";
        else if (type === "Parking") iconName = "block";
        else iconName = "warning";

        if (ui.modalAlertIcon) ui.modalAlertIcon.textContent = iconName;
        if (ui.modalAlertTitle) ui.modalAlertTitle.textContent = msg;
        if (ui.modalAlertSubtitle) ui.modalAlertSubtitle.textContent = `Take a live photo for ${type} alert`;

        if (type === "Other" && ui.customMessageContainer) {
            ui.customMessageContainer.classList.remove('hidden');
            if (ui.customMessageInput) {
                ui.customMessageInput.value = '';
                setTimeout(() => ui.customMessageInput.focus(), 200);
            }
        } else if (ui.customMessageContainer) {
            ui.customMessageContainer.classList.add('hidden');
        }

        if (ui.photoModal) {
            ui.photoModal.classList.remove('hidden');
        }

        // Start live camera stream inside the browser
        startLiveCamera();
    });
});

// Start rear camera stream directly in browser
async function startLiveCamera() {
    stopLiveCamera();
    capturedPhotoFile = null;

    if (ui.cameraViewfinderContainer) ui.cameraViewfinderContainer.classList.remove('hidden');
    if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.add('hidden');
    if (ui.cameraFallbackContainer) ui.cameraFallbackContainer.classList.add('hidden');
    if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = true;
    if (ui.confirmSendText) ui.confirmSendText.textContent = "Take Photo to Send";

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("getUserMedia not supported by browser");
        }

        // Controlled resolution avoids Android RAM pressure
        const constraints = {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
            },
            audio: false
        };

        activeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (ui.cameraVideo) {
            ui.cameraVideo.srcObject = activeCameraStream;
            await ui.cameraVideo.play();
        }
    } catch (err) {
        console.warn("Live camera viewfinder unavailable, enabling fallback:", err);
        stopLiveCamera();
        if (ui.cameraViewfinderContainer) ui.cameraViewfinderContainer.classList.add('hidden');
        if (ui.cameraFallbackContainer) ui.cameraFallbackContainer.classList.remove('hidden');
    }
}

// Stop camera stream to free hardware resources
function stopLiveCamera() {
    if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        activeCameraStream = null;
    }
    if (ui.cameraVideo) {
        ui.cameraVideo.srcObject = null;
    }
}

// Snap photo from live video onto lightweight canvas
function capturePhotoFromStream() {
    if (!ui.cameraVideo || !activeCameraStream) return;

    try {
        const video = ui.cameraVideo;
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob((blob) => {
            if (!blob) return;

            capturedPhotoFile = new File([blob], `alert_proof_${Date.now()}.jpg`, { type: 'image/jpeg' });
            if (ui.photoPreviewImg) {
                ui.photoPreviewImg.src = URL.createObjectURL(blob);
            }

            // Switch from live stream to preview
            if (ui.cameraViewfinderContainer) ui.cameraViewfinderContainer.classList.add('hidden');
            if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.remove('hidden');

            // Enable send button
            if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = false;
            if (ui.confirmSendText) ui.confirmSendText.textContent = "Send Alert with Photo";

            // Stop camera hardware stream immediately to free memory
            stopLiveCamera();
        }, 'image/jpeg', 0.82);

    } catch (err) {
        console.error("Failed to capture photo:", err);
    }
}

// Shutter button inside live viewfinder
if (ui.snapPhotoBtn) {
    ui.snapPhotoBtn.addEventListener('click', capturePhotoFromStream);
}

// Retake button inside preview
if (ui.retakePhotoBtn) {
    ui.retakePhotoBtn.addEventListener('click', () => {
        startLiveCamera();
    });
}

// Fallback upload button if camera permission blocked
if (ui.fallbackCameraBtn) {
    ui.fallbackCameraBtn.addEventListener('click', () => {
        if (ui.liveCameraInput) {
            ui.liveCameraInput.value = '';
            ui.liveCameraInput.click();
        }
    });
}

if (ui.liveCameraInput) {
    ui.liveCameraInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            capturedPhotoFile = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                if (ui.photoPreviewImg) {
                    ui.photoPreviewImg.src = event.target.result;
                }
                if (ui.cameraFallbackContainer) ui.cameraFallbackContainer.classList.add('hidden');
                if (ui.cameraViewfinderContainer) ui.cameraViewfinderContainer.classList.add('hidden');
                if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.remove('hidden');

                if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = false;
                if (ui.confirmSendText) ui.confirmSendText.textContent = "Send Alert with Photo";
            };
            reader.readAsDataURL(capturedPhotoFile);
        }
    });
}

function closePhotoModal() {
    stopLiveCamera();
    if (ui.photoModal) {
        ui.photoModal.classList.add('hidden');
    }
    currentPendingAlert = null;
    capturedPhotoFile = null;
    if (ui.liveCameraInput) ui.liveCameraInput.value = '';
}

// Modal Dismiss Listeners
if (ui.closeModalBtn) ui.closeModalBtn.addEventListener('click', closePhotoModal);
if (ui.cancelAlertBtn) ui.cancelAlertBtn.addEventListener('click', closePhotoModal);
if (ui.photoModal) {
    ui.photoModal.addEventListener('click', (e) => {
        if (e.target === ui.photoModal) closePhotoModal();
    });
}

// Send Alert with Live Photo
async function executeSendAlert() {
    if (!currentPendingAlert) return;

    if (!capturedPhotoFile) {
        alert("Please take a live photo of the vehicle to send this alert.");
        return;
    }

    // Check cooldown
    const lastAlertTime = localStorage.getItem(`lastAlert_${vehicleId}`);
    if (lastAlertTime) {
        const timeDiff = new Date().getTime() - parseInt(lastAlertTime, 10);
        const cooldownMs = 2 * 60 * 1000;
        if (timeDiff < cooldownMs) {
            const remainingMin = Math.ceil((cooldownMs - timeDiff) / (60 * 1000));
            alert(`Please wait ${remainingMin} minute(s) before sending another alert.`);
            return;
        }
    }

    if (!currentVehicleData) {
        alert("Vehicle data not found.");
        return;
    }

    if (!supabase) {
        alert("Supabase is not configured.");
        return;
    }

    let finalMessage = currentPendingAlert.defaultMessage;
    if (currentPendingAlert.type === "Other" && ui.customMessageInput && ui.customMessageInput.value.trim()) {
        finalMessage = ui.customMessageInput.value.trim();
    }

    // Disable buttons & show loading
    if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = true;
    if (ui.confirmSendText) ui.confirmSendText.textContent = "Uploading & Sending...";

    let proofImageUrl = null;

    try {
        // 1. Upload live photo to Supabase Storage 'alert_proofs'
        const file = capturedPhotoFile;
        const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${vehicleId}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('alert_proofs')
            .upload(filePath, file);

        if (uploadError) {
            console.error("Storage upload error:", uploadError);
            throw new Error("Failed to upload live photo: " + uploadError.message);
        }

        const { data: { publicUrl } } = supabase.storage
            .from('alert_proofs')
            .getPublicUrl(filePath);

        proofImageUrl = publicUrl;

        // 2. Insert alert record into Supabase Database
        const newAlertId = crypto.randomUUID();
        const payload = {
            id: newAlertId,
            vehicle_id: vehicleId,
            vehicle_no: currentVehicleData.vehicle_no || 'Unknown',
            owner_email: currentVehicleData.user_email || '', 
            alert_type: currentPendingAlert.type,
            message: finalMessage,
            is_read: false,
            proof_image_url: proofImageUrl,
            created_at: new Date().toISOString()
        };

        const { error: insertError } = await supabase
            .from('alerts')
            .insert([payload]);

        if (insertError) {
            throw insertError;
        }

        // Store cooldown timestamp
        localStorage.setItem(`lastAlert_${vehicleId}`, new Date().getTime().toString());

        // 3. Trigger FCM Push Notification
        try {
            await supabase.functions.invoke('send-fcm-notification', {
                body: { record: payload }
            });
        } catch (fcmError) {
            console.error("FCM Trigger Error:", fcmError);
        }

        // Close modal and show success screen
        closePhotoModal();

        ui.alertsInputArea.classList.add('hidden');
        const issueTitle = document.getElementById('issueTitle');
        if (issueTitle) issueTitle.classList.add('hidden');

        if (ui.successArea) ui.successArea.classList.remove('hidden');

        window.currentAlertId = newAlertId;
        showToast();

    } catch (error) {
        console.error("Error sending alert with photo:", error);
        alert("Failed to send alert: " + (error.message || error));
        if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = false;
        if (ui.confirmSendText) ui.confirmSendText.textContent = "Send Alert with Photo";
    }
}

if (ui.confirmSendAlertBtn) {
    ui.confirmSendAlertBtn.addEventListener('click', executeSendAlert);
}

function showToast() {
    ui.toast.classList.remove('hidden');
    setTimeout(() => {
        ui.toast.classList.add('hidden');
    }, 3000);
}

if (ui.requestChatBtn) {
    ui.requestChatBtn.addEventListener('click', async () => {
        if (!window.currentAlertId) return;
        ui.requestChatBtn.disabled = true;
        
        const textSpan = ui.requestChatBtn.querySelectorAll('span')[1];
        if (textSpan) textSpan.textContent = 'Requesting...';
        
        try {
            const { error } = await supabase.from('alert_messages').insert([{
                alert_id: window.currentAlertId,
                sender_type: 'passerby',
                message: "I would like to chat with you regarding this alert. Can I communicate with you?"
            }]);
            
            if (error) {
                console.error("Insert error:", error);
            }

            try {
                await supabase.functions.invoke('send-fcm-notification', {
                    body: { 
                        record: {
                            id: window.currentAlertId,
                            owner_email: currentVehicleData.user_email || '',
                            vehicle_no: currentVehicleData.vehicle_no || 'Unknown',
                            alert_type: "Chat Request",
                            message: "A passerby wants to communicate with you regarding your vehicle."
                        } 
                    }
                });
            } catch (fcmError) {
                console.error("FCM Trigger Error:", fcmError);
            }
        } catch (e) {
            console.error("Failed to send chat request message:", e);
        }
        
        window.location.href = `chat.html?alert_id=${window.currentAlertId}&vehicle_no=${encodeURIComponent(currentVehicleData.vehicle_no || 'Unknown')}`;
    });
}

// Start the app when the script loads
loadVehicle();
