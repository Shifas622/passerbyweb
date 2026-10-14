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

    // Live Photo Modal & Camera Elements
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
    cameraTriggerBox: document.getElementById('cameraTriggerBox'),
    photoPlaceholder: document.getElementById('photoPlaceholder'),
    photoPreviewContainer: document.getElementById('photoPreviewContainer'),
    photoPreviewImg: document.getElementById('photoPreviewImg'),
    retakePhotoBtn: document.getElementById('retakePhotoBtn'),
    livePhotoInput: document.getElementById('livePhotoInput')
};

let currentVehicleData = null;
let currentPendingAlert = null; // { type, message }
let capturedPhotoFile = null;

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

// === LIVE PHOTO MODAL FLOW ===

function openPhotoModal(type, defaultMessage) {
    currentPendingAlert = { type, defaultMessage };
    capturedPhotoFile = null;

    // Reset file input & preview
    if (ui.livePhotoInput) ui.livePhotoInput.value = '';
    if (ui.photoPreviewImg) ui.photoPreviewImg.src = '';
    if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.add('hidden');
    if (ui.photoPlaceholder) ui.photoPlaceholder.classList.remove('hidden');

    // Configure icons and titles
    let iconName = "warning";
    if (type === "Emergency") iconName = "lightbulb";
    else if (type === "Security") iconName = "sensor_window";
    else if (type === "Parking") iconName = "block";
    else iconName = "warning";

    if (ui.modalAlertIcon) ui.modalAlertIcon.textContent = iconName;
    if (ui.modalAlertTitle) ui.modalAlertTitle.textContent = defaultMessage;
    if (ui.modalAlertSubtitle) ui.modalAlertSubtitle.textContent = `Live photo proof is required for ${type} alert`;

    // Handle "Other" custom description field
    if (type === "Other" && ui.customMessageContainer) {
        ui.customMessageContainer.classList.remove('hidden');
        if (ui.customMessageInput) {
            ui.customMessageInput.value = '';
            setTimeout(() => ui.customMessageInput.focus(), 200);
        }
    } else if (ui.customMessageContainer) {
        ui.customMessageContainer.classList.add('hidden');
    }

    // Require live photo before allowing sending
    if (ui.confirmSendAlertBtn) {
        ui.confirmSendAlertBtn.disabled = true;
    }
    if (ui.confirmSendText) {
        ui.confirmSendText.textContent = "Take Photo to Send";
    }

    // Show modal immediately
    if (ui.photoModal) {
        ui.photoModal.classList.remove('hidden');
    }

    // Trigger live photo camera prompt directly from user click
    try {
        if (ui.livePhotoInput) {
            ui.livePhotoInput.click();
        }
    } catch (err) {
        console.log("Camera auto-prompt notice:", err);
    }
}

function closePhotoModal() {
    if (ui.photoModal) {
        ui.photoModal.classList.add('hidden');
    }
    currentPendingAlert = null;
    capturedPhotoFile = null;
    if (ui.livePhotoInput) ui.livePhotoInput.value = '';
}

// Open camera when camera trigger box is clicked
if (ui.cameraTriggerBox) {
    ui.cameraTriggerBox.addEventListener('click', (e) => {
        if (e.target.closest('#retakePhotoBtn')) return;
        if (ui.livePhotoInput) ui.livePhotoInput.click();
    });
}

// Retake photo button
if (ui.retakePhotoBtn) {
    ui.retakePhotoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ui.livePhotoInput) ui.livePhotoInput.click();
    });
}

// Handle captured live photo
if (ui.livePhotoInput) {
    ui.livePhotoInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            capturedPhotoFile = e.target.files[0];

            const reader = new FileReader();
            reader.onload = (event) => {
                if (ui.photoPreviewImg) ui.photoPreviewImg.src = event.target.result;
                if (ui.photoPlaceholder) ui.photoPlaceholder.classList.add('hidden');
                if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.remove('hidden');

                // Enable send button
                if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = false;
                if (ui.confirmSendText) ui.confirmSendText.textContent = "Send Alert with Photo";
            };
            reader.readAsDataURL(capturedPhotoFile);
        } else {
            capturedPhotoFile = null;
            if (ui.photoPreviewContainer) ui.photoPreviewContainer.classList.add('hidden');
            if (ui.photoPlaceholder) ui.photoPlaceholder.classList.remove('hidden');
            if (ui.confirmSendAlertBtn) ui.confirmSendAlertBtn.disabled = true;
            if (ui.confirmSendText) ui.confirmSendText.textContent = "Take Photo to Send";
        }
    });
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

// Clicking alert button pops up live photo modal
ui.alertBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const msg = btn.getAttribute('data-message');
        openPhotoModal(type, msg);
    });
});

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
