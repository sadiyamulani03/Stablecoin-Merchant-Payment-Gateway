// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only token. It is NOT the official DDSC stablecoin.
contract MockDDSC is ERC20 {
    uint8 private constant TOKEN_DECIMALS = 2;

    constructor() ERC20("Mock Dirham Digital Stablecoin", "mDDSC") {}

    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }

    /// @notice Unrestricted mint is intentional for isolated testnets only.
    function mint(address to, uint256 amount) external {
        require(to != address(0), "MockDDSC: zero recipient");
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
