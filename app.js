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
    toast: document.getElementById('toast')
};

let currentVehicleData = null;

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
}

function showError(msg) {
    ui.errorMsg.textContent = msg;
    ui.loading.classList.add('hidden');
    ui.vehicle.classList.add('hidden');
    ui.error.classList.remove('hidden');
}

async function sendAlert(type, message) {
    if (!currentVehicleData) {
        alert("Vehicle data not found.");
        return;
    }

    if (!supabase) {
        alert("Supabase is not configured.");
        return;
    }

    // Check cooldown before sending
    const lastAlertTime = localStorage.getItem(`lastAlert_${vehicleId}`);
    if (lastAlertTime) {
        const timeDiff = new Date().getTime() - parseInt(lastAlertTime, 10);
        const cooldownMs = 5 * 60 * 1000; // 5 minutes cooldown
        if (timeDiff < cooldownMs) {
            const remainingMin = Math.ceil((cooldownMs - timeDiff) / (60 * 1000));
            alert(`Please wait ${remainingMin} minute(s) before sending another alert.`);
            return;
        }
    }

    // Disable buttons while sending
    ui.alertBtns.forEach(btn => btn.disabled = true);
    ui.loading.classList.remove('hidden');
    ui.vehicle.classList.add('hidden');
    ui.loading.querySelector('p').textContent = "Sending alert...";

    try {
        const payload = {
            vehicle_id: vehicleId,
            vehicle_no: currentVehicleData.vehicle_no || 'Unknown',
            owner_email: currentVehicleData.user_email || '', 
            alert_type: type,
            message: message,
            is_read: false,
            created_at: new Date().toISOString()
        };

        // Save the alert in Supabase Database
        const { error } = await supabase
            .from('alerts')
            .insert([payload]);

        if (error) {
            throw error;
        }

        // Save the timestamp in localStorage for the cooldown
        localStorage.setItem(`lastAlert_${vehicleId}`, new Date().getTime().toString());

        // Trigger Push Notification via Supabase Edge Function
        try {
            await supabase.functions.invoke('send-fcm-notification', {
                body: { record: payload }
            });
        } catch (fcmError) {
            console.error("FCM Trigger Error:", fcmError);
        }

        ui.loading.classList.add('hidden');
        ui.vehicle.classList.remove('hidden');
        showToast();
    } catch (error) {
        console.error("Error sending alert:", error);
        alert("Failed to send alert: " + error.message);
        ui.loading.classList.add('hidden');
        ui.vehicle.classList.remove('hidden');
    } finally {
        ui.alertBtns.forEach(btn => btn.disabled = false);
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

// Start the app when the script loads
loadVehicle();
