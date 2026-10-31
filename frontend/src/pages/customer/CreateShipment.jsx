import { useState } from "react";
import { Link } from "react-router-dom";
import { createShipment } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import ValidatedField from "../../components/ValidatedField";
import { serverFieldError, useFormValidation, validators } from "../../utils/formValidation";

const emptyForm = {
  senderName: "",
  senderPhone: "",
  receiverName: "",
  receiverPhone: "",
  origin: "",
  destination: "",
  packageType: "General",
  weight: ""
};

function CreateShipment() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const validation = useFormValidation(form, { senderName: validators.name, senderPhone: validators.optionalPhone, receiverName: validators.name, receiverPhone: validators.optionalPhone, origin: validators.requiredText, destination: validators.requiredText, packageType: validators.requiredText, weight: validators.weight });

  const handleChange = (event) => {
    const next = { ...form, [event.target.name]: event.target.value };
    setForm(next); validation.changeField(event.target.name, event.target.value, next);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setCreated(null);
    if (!validation.validateAll()) return;
    setLoading(true);

    try {
      const shipment = await createShipment({
        ...form,
        weight: form.weight === "" ? 0 : Number(form.weight)
      });
      setCreated(shipment);
      setForm(emptyForm);
      validation.clearErrors();
    } catch (submitError) {
      setError(submitError.message);
      validation.setServerErrors(serverFieldError(submitError.message, { origin: ["origin"], destination: ["destination"], senderName: ["sender"], receiverName: ["receiver"], weight: ["weight"] }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-shipment-page">
      <div className="create-shipment-header">
        <div>
          <h1>Create Shipment</h1>
          <p>Enter sender, receiver, and route details.</p>
        </div>
      </div>

      {created && (
        <div className="success-message" role="status">
          <strong>Shipment created</strong>
          <span>
            Tracking number: <b>{created.trackingNumber || created.trackingId}</b>
          </span>
          <Link to={`/track/${encodeURIComponent(created.trackingNumber || created.trackingId)}`}>
            Track this shipment
          </Link>
        </div>
      )}
      <ErrorMessage message={error} />

      <form className="create-shipment-form" noValidate onSubmit={handleSubmit}>
        <section className="form-section">
          <h2>Shipment details</h2>
          <div className="form-grid">
            <FormField label="Sender name" name="senderName" value={form.senderName} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.senderName} placeholder="John Doe" />
            <FormField label="Sender phone" name="senderPhone" value={form.senderPhone} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.senderPhone} placeholder="9876543210" />
            <FormField label="Receiver name" name="receiverName" value={form.receiverName} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.receiverName} placeholder="Jane Doe" />
            <FormField label="Receiver phone" name="receiverPhone" value={form.receiverPhone} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.receiverPhone} placeholder="9876543210" />
            <FormField label="Origin address or city" name="origin" value={form.origin} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.origin} placeholder="Bengaluru, Karnataka" />
            <FormField label="Destination address or city" name="destination" value={form.destination} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.destination} placeholder="Mumbai, Maharashtra" />
            <FormField label="Package type" name="packageType" value={form.packageType} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.packageType} placeholder="General" />
            <FormField label="Weight (kg)" name="weight" type="number" min="0" step="0.1" value={form.weight} onChange={handleChange} onBlur={validation.blurField} error={validation.errors.weight} placeholder="e.g. 2.5" />
          </div>
          <div className="action-buttons">
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Shipment"}
            </button>
            <Link className="secondary-button" to="/shipments">View Shipments</Link>
          </div>
        </section>
      </form>
    </div>
  );
}

function FormField({ label, name, value, onChange, onBlur, error, ...props }) {
  return <ValidatedField id={name} name={name} label={label} value={value} onChange={onChange} onBlur={onBlur} error={error} {...props} />;
}

export default CreateShipment;
