-- Explicit negotiated delivery method and fee (fee only when owner_delivery).
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS negotiation_delivery_method text
    CHECK (
      negotiation_delivery_method IS NULL
      OR negotiation_delivery_method IN ('pickup', 'owner_delivery')
    );

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS negotiation_delivery_fee numeric;

COMMENT ON COLUMN offers.negotiation_delivery_method IS 'pickup | owner_delivery — negotiated fulfillment, not inferred from fee.';
COMMENT ON COLUMN offers.negotiation_delivery_fee IS 'Delivery fee when owner_delivery; NULL when pickup. 0 means free delivery.';
