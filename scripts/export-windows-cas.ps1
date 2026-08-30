# Export Windows trusted CAs as PEM for Node's NODE_EXTRA_CA_CERTS.
# Node 22.13 does not support --use-system-ca, so antivirus HTTPS-inspection
# roots (e.g. Avast Web/Mail Shield) are otherwise untrusted.
param(
  [Parameter(Mandatory = $true)]
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'

$stores = @(
  @{ Name = 'Root'; Location = 'LocalMachine' },
  @{ Name = 'Root'; Location = 'CurrentUser' },
  @{ Name = 'CA'; Location = 'LocalMachine' },
  @{ Name = 'CA'; Location = 'CurrentUser' }
)

$seen = @{}
$builder = New-Object System.Text.StringBuilder

foreach ($entry in $stores) {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($entry.Name, $entry.Location)
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    foreach ($cert in $store.Certificates) {
      if ($seen.ContainsKey($cert.Thumbprint)) { continue }
      $seen[$cert.Thumbprint] = $true
      $raw = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
      $b64 = [Convert]::ToBase64String($raw, [Base64FormattingOptions]::InsertLineBreaks)
      [void]$builder.AppendLine('-----BEGIN CERTIFICATE-----')
      [void]$builder.AppendLine($b64)
      [void]$builder.AppendLine('-----END CERTIFICATE-----')
    }
  } finally {
    $store.Close()
  }
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($OutFile, $builder.ToString(), $utf8)
