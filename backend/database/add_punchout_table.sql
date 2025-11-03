-- Add punchout_sessions table to track punchout shopping sessions

CREATE TABLE punchout_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vendor_id VARCHAR(100) NOT NULL,
    cost_center_id INTEGER REFERENCES cost_centers(id),
    status VARCHAR(50) DEFAULT 'initiated', -- initiated, completed, cancelled, error
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    metadata JSONB, -- Store additional session data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_punchout_sessions_user_id ON punchout_sessions(user_id);
CREATE INDEX idx_punchout_sessions_status ON punchout_sessions(status);
CREATE INDEX idx_punchout_sessions_vendor_id ON punchout_sessions(vendor_id);

-- Add comment
COMMENT ON TABLE punchout_sessions IS 'Tracks punchout catalog shopping sessions with external vendors';
