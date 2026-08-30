# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

# The API URL is exported by SAM after the backend stack is deployed.
data "aws_cloudformation_export" "api_url" {
  count = var.frontend_enabled ? 1 : 0
  name  = "${var.sam_stack_name}-ApiEndpoint"
}

# ---------------------------------------------------------------------------
# S3 bucket for static frontend assets
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  count         = var.frontend_enabled ? 1 : 0
  bucket        = local.bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  count  = var.frontend_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# CloudFront Origin Access Control (OAC)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "main" {
  count                             = var.frontend_enabled ? 1 : 0
  name                              = local.oac_name
  description                       = "OAC for ${local.name_prefix} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# Bucket policy — only the CloudFront distribution can read objects
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "cloudfront_s3" {
  count = var.frontend_enabled ? 1 : 0

  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend[0].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.main[0].id}"]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  count  = var.frontend_enabled ? 1 : 0
  bucket = aws_s3_bucket.frontend[0].id
  policy = data.aws_iam_policy_document.cloudfront_s3[0].json
}

# ---------------------------------------------------------------------------
# CloudFront origin request policy for the API Gateway origin
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_request_policy" "api" {
  count   = var.frontend_enabled ? 1 : 0
  name    = "${local.name_prefix}-api-origin-request"
  comment = "Forward all viewer headers except Host to API Gateway"

  cookies_config {
    cookie_behavior = "all"
  }
  headers_config {
    header_behavior = "allExcept"
    headers {
      items = ["Host"]
    }
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

# ---------------------------------------------------------------------------
# CloudFront distribution — S3 (static) + API Gateway (/api/*)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "main" {
  count               = var.frontend_enabled ? 1 : 0
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend[0].bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.main[0].id
  }

  origin {
    domain_name = regex("https://([^/]+)", data.aws_cloudformation_export.api_url[0].value)[0]
    origin_path = regex("https://[^/]+(/.*)", data.aws_cloudformation_export.api_url[0].value)[0]
    origin_id   = local.api_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = local.api_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled

    origin_request_policy_id = aws_cloudfront_origin_request_policy.api[0].id
  }

  price_class = "PriceClass_100"

  # Serve index.html for any path not found in S3 so client-side routing
  # (e.g. /students/:id, /admin) works on refresh and deep links.
  # With OAC the bucket has no ListBucket permission, so S3 answers 403
  # (not 404) for missing keys - both must be handled.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${local.name_prefix}-distribution"
  }
}
