-- Migration: Add Stellar Wave Features Tables
-- Version: 1.0.0
-- Description: Adds tables for API Changelog Diff Viewer, Community Annotation Moderation,
--              Public Dataset Publication Pipeline, and Incident Evidence Annotation Search

-- Create API Changelog table
CREATE TABLE IF NOT EXISTS api_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(20) NOT NULL UNIQUE,
  release_date TIMESTAMP NOT NULL,
  changes TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_breaking BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_changelog_version ON api_changelog(version);
CREATE INDEX IF NOT EXISTS idx_api_changelog_release_date ON api_changelog(release_date);

-- Create API Changelog Details table
CREATE TABLE IF NOT EXISTS api_changelog_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES api_changelog(id) ON DELETE CASCADE,
  feature VARCHAR(255) NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('added', 'removed', 'modified', 'deprecated', 'fixed')),
  description TEXT NOT NULL,
  is_breaking BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_changelog_details_version ON api_changelog_details(version_id);
CREATE INDEX IF NOT EXISTS idx_api_changelog_details_feature ON api_changelog_details(feature);

-- Create Community Annotations table
CREATE TABLE IF NOT EXISTS community_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  author VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'under_review')),
  moderated_at TIMESTAMP,
  moderator_id VARCHAR(255),
  review_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_community_annotations_status ON community_annotations(status);
CREATE INDEX IF NOT EXISTS idx_community_annotations_author ON community_annotations(author);
CREATE INDEX IF NOT EXISTS idx_community_annotations_created ON community_annotations(created_at);

-- Create Annotation Moderation Logs table
CREATE TABLE IF NOT EXISTS annotation_moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES community_annotations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'reject', 'review')),
  moderator_id VARCHAR(255) NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_annotation ON annotation_moderation_logs(annotation_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_moderator ON annotation_moderation_logs(moderator_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_status ON annotation_moderation_logs(status);

-- Create Public Datasets table
CREATE TABLE IF NOT EXISTS public_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0.0',
  is_public BOOLEAN DEFAULT FALSE,
  access_level VARCHAR(50) NOT NULL DEFAULT 'public' CHECK (access_level IN ('public', 'restricted', 'internal')),
  published_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_datasets_is_public ON public_datasets(is_public);
CREATE INDEX IF NOT EXISTS idx_public_datasets_category ON public_datasets(category);
CREATE INDEX IF NOT EXISTS idx_public_datasets_access_level ON public_datasets(access_level);
CREATE INDEX IF NOT EXISTS idx_public_datasets_published ON public_datasets(published_at);

-- Create Publication Jobs table
CREATE TABLE IF NOT EXISTS publication_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES public_datasets(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  published_at TIMESTAMP,
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publication_jobs_dataset ON publication_jobs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_status ON publication_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publication_jobs_created ON publication_jobs(created_at);

-- Create Incident Evidence Annotations table
CREATE TABLE IF NOT EXISTS incident_evidence_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id VARCHAR(255) NOT NULL,
  annotation_id UUID,
  content TEXT NOT NULL,
  author VARCHAR(255) NOT NULL,
  severity VARCHAR(50) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  evidence_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_evidence_incident ON incident_evidence_annotations(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_evidence_severity ON incident_evidence_annotations(severity);
CREATE INDEX IF NOT EXISTS idx_incident_evidence_tags ON incident_evidence_annotations USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_incident_evidence_content ON incident_evidence_annotations USING GIN(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_incident_evidence_created ON incident_evidence_annotations(created_at);

-- Add trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_api_changelog_timestamp BEFORE UPDATE ON api_changelog
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_community_annotations_timestamp BEFORE UPDATE ON community_annotations
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_publication_jobs_timestamp BEFORE UPDATE ON publication_jobs
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_incident_evidence_timestamp BEFORE UPDATE ON incident_evidence_annotations
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
