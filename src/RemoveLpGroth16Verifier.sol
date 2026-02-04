// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract RemoveLpGroth16Verifier {
  // Scalar field size
  uint256 constant r =
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
  // Base field size
  uint256 constant q =
    21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;

  // Verification Key data
  uint256 constant alphax =
    15_949_756_556_690_466_747_577_612_202_324_923_265_854_677_695_170_916_124_095_717_017_897_957_347_946;
  uint256 constant alphay =
    15_221_333_140_604_604_744_960_621_107_411_173_890_443_033_726_437_603_652_037_687_772_637_881_817_140;
  uint256 constant betax1 =
    10_873_212_957_103_924_490_853_309_180_223_609_586_913_741_984_636_118_922_343_031_984_898_811_438_399;
  uint256 constant betax2 =
    1_620_498_299_801_030_767_078_500_623_396_205_946_093_730_647_417_843_383_439_044_819_374_964_016_049;
  uint256 constant betay1 =
    3_442_397_151_809_376_283_294_582_461_389_409_218_685_252_836_263_194_579_910_500_057_981_697_862_004;
  uint256 constant betay2 =
    12_082_755_617_560_020_767_107_966_424_455_489_199_586_723_621_053_664_653_276_779_804_162_350_674_876;
  uint256 constant gammax1 =
    11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634;
  uint256 constant gammax2 =
    10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781;
  uint256 constant gammay1 =
    4_082_367_875_863_433_681_332_203_403_145_435_568_316_851_327_593_401_208_105_741_076_214_120_093_531;
  uint256 constant gammay2 =
    8_495_653_923_123_431_417_604_973_247_489_272_438_418_190_587_263_600_148_770_280_649_306_958_101_930;
  uint256 constant deltax1 =
    11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634;
  uint256 constant deltax2 =
    10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781;
  uint256 constant deltay1 =
    4_082_367_875_863_433_681_332_203_403_145_435_568_316_851_327_593_401_208_105_741_076_214_120_093_531;
  uint256 constant deltay2 =
    8_495_653_923_123_431_417_604_973_247_489_272_438_418_190_587_263_600_148_770_280_649_306_958_101_930;

  uint256 constant IC0x =
    17_715_762_913_079_282_924_279_059_184_585_674_087_416_076_254_603_613_256_856_291_236_265_789_343_056;
  uint256 constant IC0y =
    20_857_048_377_664_779_062_339_678_657_082_753_851_003_094_854_968_166_842_613_229_589_227_195_791_291;

  uint256 constant IC1x =
    6_693_809_104_719_787_994_876_153_125_768_890_514_173_132_266_721_966_280_006_100_693_673_750_414_998;
  uint256 constant IC1y =
    9_466_377_769_892_127_670_256_854_885_546_719_372_674_073_119_777_002_382_827_638_028_519_093_569_806;

  uint256 constant IC2x =
    16_292_640_377_028_686_989_513_581_928_436_013_568_736_216_153_996_057_617_327_824_266_244_675_271_408;
  uint256 constant IC2y =
    21_677_117_626_429_366_386_196_769_551_647_845_384_621_513_749_887_357_329_873_364_321_777_703_159_472;

  uint256 constant IC3x =
    9_608_616_343_439_955_737_225_433_478_147_678_231_898_850_986_798_430_407_642_770_672_936_688_737_217;
  uint256 constant IC3y =
    517_501_044_314_471_410_004_018_885_285_373_902_863_463_017_784_082_373_753_079_652_232_435_317_639;

  uint256 constant IC4x =
    15_283_156_655_955_996_095_944_876_065_517_206_015_679_387_788_020_603_838_317_745_360_368_168_427_627;
  uint256 constant IC4y =
    17_650_061_942_243_138_642_404_174_993_622_015_589_237_887_962_655_716_026_773_347_037_617_455_465_750;

  uint256 constant IC5x =
    7_977_342_217_933_398_244_016_301_104_497_666_300_689_180_407_132_032_894_769_538_415_174_828_294_529;
  uint256 constant IC5y =
    20_843_565_831_549_107_411_391_846_166_984_220_857_162_575_488_958_381_528_513_539_695_840_376_697_909;

  uint256 constant IC6x =
    16_759_424_067_498_403_944_091_879_494_568_689_919_519_460_975_448_950_665_857_047_013_989_651_758_617;
  uint256 constant IC6y =
    5_443_043_685_464_856_622_428_862_102_736_068_337_925_005_385_326_827_214_687_239_220_702_699_601_404;

  // Memory data
  uint16 constant pVk = 0;
  uint16 constant pPairing = 128;

  uint16 constant pLastMem = 896;

  function verifyProof(
    uint256[2] calldata _pA,
    uint256[2][2] calldata _pB,
    uint256[2] calldata _pC,
    uint256[6] calldata _pubSignals
  )
    public
    view
    returns (bool)
  {
    assembly {
      function checkField(v) {
        if iszero(lt(v, r)) {
          mstore(0, 0)
          return(0, 0x20)
        }
      }

      // G1 function to multiply a G1 value(x,y) to value in an address
      function g1_mulAccC(pR, x, y, s) {
        let success
        let mIn := mload(0x40)
        mstore(mIn, x)
        mstore(add(mIn, 32), y)
        mstore(add(mIn, 64), s)

        success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

        if iszero(success) {
          mstore(0, 0)
          return(0, 0x20)
        }

        mstore(add(mIn, 64), mload(pR))
        mstore(add(mIn, 96), mload(add(pR, 32)))

        success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

        if iszero(success) {
          mstore(0, 0)
          return(0, 0x20)
        }
      }

      function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
        let _pPairing := add(pMem, pPairing)
        let _pVk := add(pMem, pVk)

        mstore(_pVk, IC0x)
        mstore(add(_pVk, 32), IC0y)

        // Compute the linear combination vk_x

        g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

        g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

        g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))

        g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))

        g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))

        g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))

        // -A
        mstore(_pPairing, calldataload(pA))
        mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

        // B
        mstore(add(_pPairing, 64), calldataload(pB))
        mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
        mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
        mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

        // alpha1
        mstore(add(_pPairing, 192), alphax)
        mstore(add(_pPairing, 224), alphay)

        // beta2
        mstore(add(_pPairing, 256), betax1)
        mstore(add(_pPairing, 288), betax2)
        mstore(add(_pPairing, 320), betay1)
        mstore(add(_pPairing, 352), betay2)

        // vk_x
        mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
        mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))

        // gamma2
        mstore(add(_pPairing, 448), gammax1)
        mstore(add(_pPairing, 480), gammax2)
        mstore(add(_pPairing, 512), gammay1)
        mstore(add(_pPairing, 544), gammay2)

        // C
        mstore(add(_pPairing, 576), calldataload(pC))
        mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

        // delta2
        mstore(add(_pPairing, 640), deltax1)
        mstore(add(_pPairing, 672), deltax2)
        mstore(add(_pPairing, 704), deltay1)
        mstore(add(_pPairing, 736), deltay2)

        let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

        isOk := and(success, mload(_pPairing))
      }

      let pMem := mload(0x40)
      mstore(0x40, add(pMem, pLastMem))

      // Validate that all evaluations ∈ F

      checkField(calldataload(add(_pubSignals, 0)))

      checkField(calldataload(add(_pubSignals, 32)))

      checkField(calldataload(add(_pubSignals, 64)))

      checkField(calldataload(add(_pubSignals, 96)))

      checkField(calldataload(add(_pubSignals, 128)))

      checkField(calldataload(add(_pubSignals, 160)))

      checkField(calldataload(add(_pubSignals, 192)))

      // Validate all evaluations
      let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

      mstore(0, isValid)
      return(0, 0x20)
    }
  }
}
