resource "aws_dynamodb_table" "this" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  lifecycle {
    prevent_destroy = true
  }

  server_side_encryption {
    enabled = true
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }

  # Inverted lookups: session-by-token, report-by-id, export/analytics partitions
  global_secondary_index {
    name            = "Lookup"
    projection_type = "ALL"
    key_schema {
      attribute_name = "GSI1PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI1SK"
      key_type       = "RANGE"
    }
  }

  # Listing: users by role, forms by audience, models by status, children by status
  global_secondary_index {
    name            = "RoleStatus"
    projection_type = "ALL"
    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI2SK"
      key_type       = "RANGE"
    }
  }
}
