function Get-TavokRepoRoot {
    param(
        [string]$LoaderRoot = $PSScriptRoot
    )

    return (Resolve-Path (Join-Path $LoaderRoot "..\..")).Path
}

function Get-TavokEnvPath {
    param(
        [string]$RepoRoot = $(Get-TavokRepoRoot)
    )

    if (-not [string]::IsNullOrWhiteSpace($env:TAVOK_ENV_FILE)) {
        return $env:TAVOK_ENV_FILE
    }

    return (Join-Path $RepoRoot ".env")
}

function Import-TavokEnv {
    param(
        [string]$Path = $(Get-TavokEnvPath)
    )

    if (!(Test-Path $Path)) {
        throw "Missing .env file at '$Path'. Run scripts/setup.sh or scripts/setup.ps1 first."
    }

    $values = @{}

    foreach ($rawLine in Get-Content $Path) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
            continue
        }

        if ($line.StartsWith("export ")) {
            $line = $line.Substring(7).TrimStart()
        }

        $parts = $line -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim()

        if (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$key] = $value
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }

    return $values
}

function Assert-TavokEnvVars {
    param(
        [hashtable]$Values = @{},
        [Parameter(Mandatory)] [string[]]$Required,
        [string]$Path = $(Get-TavokEnvPath)
    )

    if ($null -eq $Values) {
        $Values = @{}
    }

    $missing = New-Object System.Collections.Generic.List[string]

    foreach ($name in $Required) {
        $value = $null
        if ($Values.ContainsKey($name)) {
            $value = $Values[$name]
        } else {
            $value = [Environment]::GetEnvironmentVariable($name, "Process")
        }

        if ([string]::IsNullOrWhiteSpace($value)) {
            $missing.Add($name)
        }
    }

    if ($missing.Count -gt 0) {
        throw "Missing required configuration: $($missing -join ', '). Update '$Path' and rerun."
    }
}
