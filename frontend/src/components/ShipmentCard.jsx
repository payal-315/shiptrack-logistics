function ShipmentCard({ shipment }) {
  return (
    <div className="shipment-card">

      <div className="shipment-card-top">
        <div>
          <span className="shipment-label">SHIPMENT ID</span>
          <h3>{shipment.id}</h3>
        </div>

        <span className={`status-badge ${shipment.statusClass}`}>
          {shipment.status}
        </span>
      </div>

      <div className="shipment-route">

        <div className="route-location">
          <span className="route-dot pickup"></span>

          <div>
            <span>From</span>
            <strong>{shipment.from}</strong>
          </div>
        </div>

        <div className="route-line"></div>

        <div className="route-location">
          <span className="route-dot destination"></span>

          <div>
            <span>To</span>
            <strong>{shipment.to}</strong>
          </div>
        </div>

      </div>

      <div className="shipment-card-bottom">

        <div>
          <span>Customer</span>
          <strong>{shipment.customer}</strong>
        </div>

        <div>
          <span>Expected Delivery</span>
          <strong>{shipment.deliveryDate}</strong>
        </div>

        <div>
          <span>Package</span>
          <strong>{shipment.package}</strong>
        </div>

      </div>

    </div>
  );
}

export default ShipmentCard;