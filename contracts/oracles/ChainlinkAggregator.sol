// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice A library for performing overflow-/underflow-safe math,
/// updated with awesomeness from of DappHub (https://github.com/dapphub/ds-math).
library BoringMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
        require((c = a + b) >= b, "BoringMath: Add Overflow");
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256 c) {
        require((c = a - b) <= a, "BoringMath: Underflow");
    }

    function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {
        require(b == 0 || (c = a * b) / b == a, "BoringMath: Mul Overflow");
    }
}

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

/// @title ChainlinkAggregator
/// @author mainnet_pat
/// @notice Aggregator which receives price data from eth mainnet and republishes it on smartbch
contract ChainlinkAggregator is IAggregator, Ownable {
    using BoringMath for uint256;

    int256 _latestAnswer;

    function setLatestAnswer(int256 latestAnswer_) public onlyOwner {
        _latestAnswer = latestAnswer_;
    }

    // Calculates the lastest exchange rate
    function latestAnswer() external view override returns (int256) {
        return _latestAnswer;
    }
}