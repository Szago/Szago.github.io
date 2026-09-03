param(
    [string]$CachePath = (Join-Path $env:USERPROFILE 'AppData\LocalLow\Evil Zeppelin\Eros Fantasy\EFD\cd.dat'),
    [string]$OutputPath = (Join-Path $PSScriptRoot 'characters.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $CachePath)) {
    throw "Character cache not found: $CachePath"
}

$classNames = @('Fighter', 'Tank', 'Healer', 'Support', 'Mage')
$elementNames = @('None', 'Flame', 'Wind', 'Water', 'Light', 'Darkness')
$raceNames = @('Human', 'Beastfolk', 'Demon', 'Mermaid', 'NonHuman')
$rarityNames = @('VeryCommon', 'Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Divine')
$factionNames = @(
    'Guardian', 'Outlaw', 'Phoenix', 'Protector', 'Succubus', 'Poseidon',
    'Zephyr', 'Dragonard', 'Celestial', 'Raider', 'Bluecoat', 'Zodiac', 'Sylphid'
)

function Get-GameValue {
    param(
        [Parameter(Mandatory)]$Record,
        [Parameter(Mandatory)][string]$Name,
        $Default = $null
    )

    $property = $Record.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $Default
    }

    return $property.Value
}

function Get-EnumName {
    param(
        [Parameter(Mandatory)]$Record,
        [Parameter(Mandatory)][string]$Property,
        [Parameter(Mandatory)][string[]]$Names
    )

    $index = [int](Get-GameValue -Record $Record -Name $Property -Default 0)
    if ($index -lt 0 -or $index -ge $Names.Count) {
        return "Unknown ($index)"
    }

    return $Names[$index]
}

$existing = @()
if (Test-Path -LiteralPath $OutputPath) {
    $existing = @((Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json) | Write-Output)
}

$existingById = @{}
foreach ($character in $existing) {
    if ($character.id) {
        $existingById[[string]$character.id] = $character
    }
    if ($character.PSObject.Properties['gameId'] -and $character.gameId) {
        $existingById[[string]$character.gameId] = $character
    }
}

$gameRecords = @((Get-Content -LiteralPath $CachePath -Raw | ConvertFrom-Json) | Write-Output)
$websiteRecords = foreach ($gameRecord in $gameRecords) {
    $hidden = [bool](Get-GameValue -Record $gameRecord -Name 'hidden' -Default $false)
    $isMinion = [bool](Get-GameValue -Record $gameRecord -Name 'isMinion' -Default $false)
    if ($hidden -or $isMinion) {
        continue
    }

    $gameId = [string]$gameRecord.id
    $id = $gameId -replace '^char_', ''
    $old = $existingById[$gameId]
    if ($null -eq $old) {
        $old = $existingById[$id]
    }

    $traits = @()
    $rawTraits = [string](Get-GameValue -Record $gameRecord -Name 'traits' -Default '')
    if ($rawTraits) {
        $traits = @($rawTraits -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    $faction = @($factionNames | Where-Object { $traits -contains $_ } | Select-Object -First 1)
    $factionValue = if ($faction.Count) { $faction[0] } else { '' }

    [ordered]@{
        id = $id
        gameId = $gameId
        name = [string]$gameRecord.Name
        image = if ($null -ne $old -and $old.PSObject.Properties['image']) { [string]$old.image } else { '' }
        class = Get-EnumName -Record $gameRecord -Property 'primaryClass' -Names $classNames
        secondaryClass = Get-EnumName -Record $gameRecord -Property 'secondaryClass' -Names $classNames
        race = Get-EnumName -Record $gameRecord -Property 'race' -Names $raceNames
        faction = $factionValue
        element = Get-EnumName -Record $gameRecord -Property 'basicElement' -Names $elementNames
        secondaryElement = Get-EnumName -Record $gameRecord -Property 'secondaryElement' -Names $elementNames
        rarity = Get-EnumName -Record $gameRecord -Property 'rarity' -Names $rarityNames
        traits = $traits
        details = if ($null -ne $old -and $old.PSObject.Properties['details']) { [string]$old.details } else { '' }
        rating = if ($null -ne $old -and $old.PSObject.Properties['rating']) { [string]$old.rating } else { '' }
        teams = if ($null -ne $old -and $old.PSObject.Properties['teams']) { [string]$old.teams } else { '' }
        placement = if ($null -ne $old -and $old.PSObject.Properties['placement']) { [string]$old.placement } else { '' }
        gameData = $gameRecord
    }
}

$websiteRecords = @($websiteRecords | Sort-Object @{ Expression = { $_.name } }, @{ Expression = { $_.id } })
$json = $websiteRecords | ConvertTo-Json -Depth 100
Set-Content -LiteralPath $OutputPath -Value $json -Encoding UTF8

Write-Host "Synced $($websiteRecords.Count) playable characters from $CachePath"
Write-Host "Wrote $OutputPath"
